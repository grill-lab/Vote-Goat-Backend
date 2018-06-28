# Required for rest of hug scripts
from pymongo import *
from random import *
import numpy as np
import pendulum
import hug
import json
import operator
from operator import itemgetter

client = MongoClient("MONGODB_SEVER_DETAILS")
db = client.popcorndb

###########

def google_analytics(request, function_name):
	"""
	# Tracking usage via Google Analytics (using the measurement protocol).
	# Why? Because the only insight into the use of HUG currently is the access & error logs (insufficient).
	"""
	google_analytics_code = 'GOOGLE_ANALYTICS_CODE'
	user_agent = str(request.user_agent)
	user_source = str(request.referer)
	user_request = str(request.uri)

	headers = {'User-Agent': user_agent}

	payload = { 'v': 1,
				'an': 'HUG',
				'tid': google_analytics_code,
				'cid': str(uuid.uuid4()),
				't': 'pageview',
				'ec': 'HUG',
				'ds': 'HUG',
				'el': 'HUG',
				'ea': 'Action',
				'dr': user_source,
				'de': 'JSON',
				'ua': user_agent,
				'dt': function_name,
				'dl': user_request,
				'ev': 0}

	try:
		r = requests.post('https://www.google-analytics.com/collect', params=payload, headers=headers)
	#	r = requests.post('www.google-analytics.com/collect', data=payload) # Either data or params
	except:
		print("COULD NOT POST TO GOOGLE ANALYTICS!")

########### Helper functions

def generate_ml_id():
	"""
	Generate a new ID which will be compatible with the machine learning components.
	"""
	users = db.Users.find().sort([("userId", -1)])

	user_count = users.count()
	if(user_count == 0):
		# Initially setting to 672l
		return 1
	else:
		return users[0]["userId"] + 1

def get_user_id_by_gg_id(gg_id):
	"""
	Find an userID, given an anonymous google ID.
	"""
	temp_user_id = db.Users.find_one({'gg_id': gg_id},{'_id':0,'userId':1})
	if temp_user_id is not None:
		return int(temp_user_id["userId"])
	else:
		return None

def get_latest_movie_id_by_gg_id(gg_id):
	"""
	Retrieve the movie which was just displayed to the user.
	Why? Because when we hit 'upvote/downvote' we need a reference to
	"""
	return db.Users.find_one({'gg_id': gg_id},{'_id':0,'mIdLastVote':1})["mIdLastVote"]

def get_voted_movie_by_user_id(user_id):
	"""
	Retrieve the list of movies
	"""
	movie_list = list(db.user_ratings.find({ 'userId': user_id }, { "_id": 0, "userId": 0, "rating": 0 }))
	tmp_list = []
	for movie in movie_list:
		tmp_list.append(movie["imdbID"])
	return tmp_list

def check_api_token(api_key):
	"""
	Check if the user's API key is valid.
	"""
	if (api_key == 'API_KEY'):
		return True
	else:
		return False

########### Below: HUG functions!

@hug.post(examples='gg_id=anonymous_google_id&api_key=API_KEY')
@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def create_user(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Creating an user in the mongodb database.
	URL: http://HOST:PORT/create_user?gg_id=anonymous_google_id&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True): # Check the api key
		# API KEY VALID
		result = db.Users.find({"gg_id": gg_id}).count()

		if (result == 0):
			# User doesn't exist, create the user!
			ml_id = generate_ml_id()
			user_name = ""

			db.Users.insert_one({"gg_id": gg_id, "name": user_name, "userId": ml_id, "total_movie_votes": 0, "total_movie_upvotes": 0, "total_movie_downvotes": 0, "ab_testing": 0})
			google_analytics(request, 'create_user_success')
			return {'user_existed': False,
					'created_user': True,
					'took': float(hug_timer)}
		else:
			google_analytics(request, 'create_user_existed')
			return {'user_existed': True,
					'created_user': False,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'create_user_apikey_error')
		return {'valid_key': False,
				'took': float(hug_timer)}

@hug.post(examples='gg_id=anonymous_google_id&movie_id=tt000001&rating=0&mode=training&conv_id=12345&raw_vote=RAW_VOTE&api_key=API_KEY')
@hug.get(examples='gg_id=anonymous_google_id&movie_id=tt000001&rating=0&mode=training&conv_id=12345&raw_vote=RAW_VOTE&api_key=API_KEY')
def submit_movie_rating(gg_id: hug.types.text, movie_id: hug.types.text, rating: hug.types.number, mode: hug.types.text, conv_id: hug.types.number, raw_vote: hug.types.text, request, api_key: hug.types.text, hug_timer=5):
	"""
	Submitting an user movie rating to mongodb.
	URL: http://HOST:PORT/submit_movie_rating?gg_id=anonymous_google_id&movie_id=tt000001&rating=1&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.
		if user_id is not None:
			result = db.user_ratings.find({"$and": [{"userId": user_id}, {"imdbID": movie_id}]}).count()

			if (mode == 'list_selection'):
				# User is in the recommendation section & they just voted!
				latest_usr_rec_ts = db.recommendation_history.find({"userId": user_id}).sort('k_mov_timestamp', -1)[0]['k_mov_timestamp'] # Getting the user's last recommendation session timestamp
				db.recommendation_history.update_one({"userId": user_id, "k_mov_timestamp": latest_usr_rec_ts}, {"$set": {"voted": rating}}) # Recording the user's vote within the recommendation section

			if (result == 0):	# User hasn't rated this movie yet.
				movie_genres = db.movie.find({"imdbID": movie_id})['genre'] # Including the movie genres in the user ratings for ML movie recommendations
				db.user_ratings.insert_one({"userId": user_id, "imdbID": movie_id, "rating": rating, "genres": movie_genres, "timestamp": timestamp, "conversation_id": conv_id, "raw_vote": raw_vote})

				user_genre_tally_data = db.user_genre_vote_tally.find({"userId": user_id})

				if (rating == 1):
					db.Users.update_one({"userId": user_id, "gg_id": gg_id}, {"$inc": {"total_movie_votes": 1, "total_movie_upvotes": 1}}) # Updating the user's voting stats
					db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_upvotes": 1, "total_goat_votes": 1}}) # Updating the movie's voting stats
				else:
					db.Users.update_one({"userId": user_id, "gg_id": gg_id}, {"$inc": {"total_movie_votes": 1, "total_movie_downvotes": 1}}) # Updating the user's voting stats
					db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_downvotes": 1, "total_goat_votes": 1}}) # Updating the movie's voting stats

			    inc_object = {}
			    for genre in movie_genres: # Tallying genre voting data
			        if rating == 1:
			            direction = 'up'
			        else:
			            direction = 'down'

			        target = str(genre)+'.'+direction
			        inc_object[target] = 1

			    db.user_genre_vote_tally.update_one({"userId": rating['userId']}, {"$inc": json.loads(json.dumps(inc_object))})
				google_analytics(request, 'submit_movie_rating_success')
				return {'success': True,
						'valid_key': True,
						'took': float(hug_timer)}
			else: # Rating already exists!
				# Overwrite rating entry using update_one & $set
				db.user_ratings.update_one({"userId": user_id, "imdbID": movie_id}, {"$set": {"rating": rating}})
				google_analytics(request, 'submit_movie_rating_overwritten')
				return {'success': False,
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# No gg_id found
			google_analytics(request, 'submit_movie_rating_id_error')
			return {'success': False,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'submit_movie_rating_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_user_ranking(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Retrieve the user's leaderboard rankings!
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.
		if user_id is not None:
			user_result = db.Users.find_one({"userId": user_id, "gg_id": gg_id})
			leaderboard = list(db.Users.find().sort('total_movie_votes', -1)) # Users sorted descending by their total_movie_votes
			leaderboard_position = leaderboard.index(user_result) + 1 # Trying to get the user's leaderboard position
			quantity_users = db.Users.find().count()

			google_analytics(request, 'get_user_ranking_success')

			return {'total_movie_votes': user_result['total_movie_votes'],
					'total_movie_upvotes': user_result['total_movie_upvotes'],
					'total_movie_downvotes': user_result['total_movie_downvotes'],
					'movie_leaderboard_ranking': leaderboard_position,
					'quantity_users': quantity_users,
					'success': True,
					'valid_key': True,
					'took': float(hug_timer)}
		else:
			# Invalid gg_id
			google_analytics(request, 'get_user_ranking_id_error')
			return {'success': False,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_user_ranking_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_user_code(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Retrieving the user's 'pincode' for the survey.
	The pincode is simply their userID.
	EDIT: Hijacked this function to check if the user exists, in case the user performs an explicit invocation to rank/recommend/stats/.. without an account!
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		temp_code = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.

		if temp_code is not None:
			google_analytics(request, 'get_user_code_success')
			return {'code': str(temp_code),
					'success': True,
					'valid_key': True,
					'took': float(hug_timer)}
		else:
			google_analytics(request, 'get_user_code_id_error')
			return {'success': False,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_user_code_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_user_ratings(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Retrieve a list of the user's rated movies, for use in the NN based recommendation system.
	Input: User's anonymous google id. Output: List of movie ratings by user.
	URL: http://HOST:PORT/get_user_ratings?gg_id=anonymous_google_id&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.
		if user_id is not None:
			results = db.user_ratings.find({"userId": user_id})

			combined_json_list = [] # Where we'll store the multiple items within the pymongo pointer

			for result in results: # Iterate over the pymongo pointer
				combined_json_list.append({"userID": result['userId'], "imdbID": result['imdbID'], "rating": result['rating']}) # Append to the list

			if (len(combined_json_list) > 0): # Check the quantity of results
				google_analytics(request, 'get_user_ratings_success')
				return combined_json_list # More than one result retrieved
			else:
				# User hasn't rated any movies
				google_analytics(request, 'get_user_ratings_fail_no_ratings')
				return {'success': False,
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# gg_id is invalid!
			google_analytics(request, 'get_user_ratings_id_error')
			return {'success': False,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_user_ratings_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

############################################

def build_training_response(mongodb_result, hug_timer, remaining_count):
	"""
	For reducing the duplicate lines in the 'get_single_training_movie' function.
	"""
	return {'movie_result': mongodb_result,
			'remaining': remaining_count,
			'success': True,
			'valid_key': True,
			'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&sort_target=imdbVotes&sort_direction=DESCENDING&genres=horror,drama&actors=actor_one,actor_two,actor_three&api_key=API_KEY')
def get_single_training_movie(gg_id: hug.types.text, sort_target: hug.types.text, sort_direction: hug.types.text, genres: hug.types.text, actors: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Get a single movie for the training bot section.
	Retrieves a list of movies the user has previously voted for, used as a filter!
	URL: http://HOST:PORT/get_single_training_movie?gg_id=anonymous_google_id&genres=none&actors=none&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID

		allowed_targets = ['imdbVotes', 'imdbRating', 'released', 'imdbID', 'title']
		if (sort_target not in allowed_targets):
			google_analytics(request, 'get_single_training_movie_invalid_target')
			return {'success': False,
					'error_message': 'Selected target not allowed yet. Create mongodb index then add to the "allowed_targets" list. Allowed: imdbVotes imdbRating released imdbID title.',
					'valid_key': True,
					'took': float(hug_timer)}

		user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID (incremental)
		if user_id is not None:
			imdb_list = get_voted_movie_by_user_id(user_id) # Produce a list of the user's previously rated movies.

			"""
			TODO: Change how we sort the list of movie results!
			* We currently just sort by the most IMDB votes, so in a way our 'Training' movie selection order is verifying IMDB movie ranking data.
				* Curation/Work-Validation vs Presentation Bias

			TODO: Maximize information gain
			* How can we maximize information gain from an individual movie?
			* Present the most controversial movies? Users might not appreciate being shown horrible/violent movies.
			"""

			if ((genres == ' ') | (genres == '%20')):
				remaining_count = db.movie.find({'imdbID': {'$nin': imdb_list}}).count()
			else:
				genres.replace('%20', ' ') # Browser pushes ' ', NodeJS pushes '%20'
				genres = genres.split(' ')
				remaining_count = db.movie.find({'imdbID': {'$nin': imdb_list}, "genre": {'$all': genres}}).count()

			if (remaining_count > 0):
				# Results found! Return 1 result to the user.

				if (sort_direction == "DESCENDING"):
					sorting = DESCENDING
				else:
					sorting = ASCENDING

				if (len(genres) > 1):
					result = (db.movie.find({'imdbID': {'$nin': imdb_list}, "genre": {'$all': genres}}, {'_id': False}).sort(sort_target, sorting).limit(1))[0]
				else:
					result = (db.movie.find({'imdbID': {'$nin': imdb_list}}, {'_id': False}).sort(sort_target, sorting).limit(1))[0]

				google_analytics(request, 'get_single_training_movie_success')
				return build_training_response(result, hug_timer, remaining_count)
			else:
				# No movie results!
				google_analytics(request, 'get_single_training_movie_no_movies_found')
				return {'success': False,
						'error_message': 'Found no movies (remaining count == 0)',
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# Invalid GG_ID
			google_analytics(request, 'get_single_training_movie_id_error')
			return {'success': False,
					'error_message': 'Invalid UserId',
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_single_training_movie_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

##################

@hug.post(examples='gg_id=anonymous_google_id&k_mov_ts=12345.123&clicked_movie=tt000001&api_key=API_KEY')
@hug.get(examples='gg_id=anonymous_google_id&k_mov_ts=12345.123&clicked_movie=tt000001&api_key=API_KEY')
def log_clicked_item(gg_id: hug.types.text, k_mov_ts: hug.types.number, clicked_movie: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	input: gg_id, api_key & k_mov_ts (timestamp of recommendation session)
	output: confirmation (post)
	URL: http://HOST:PORT/log_clicked_item?gg_id=anonymous_google_id&k_mov_ts=1512485806.920382&clicked_movie=tt000001&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID
		if user_id is not None:
			db.recommendation_history.update_one({"userId": user_id, "k_mov_timestamp": k_mov_ts}, {"$set": {"clicked_movie_IDs": clicked_movie}})
			google_analytics(request, 'log_clicked_item_success')
			return {'success': True,
					'valid_key': True,
					'took': float(hug_timer)}
		else:
			# Invalid GG_ID
			google_analytics(request, 'log_clicked_item_id_error')
			return {'success': True,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'log_clicked_item_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_random_movie_list(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Input: gg_id, api_key
	Output: Ten random movies.
	URL: http://HOST:PORT/get_random_movie_list?gg_id=anonymous_google_id&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID (incremental)
		if user_id is not None:
			result_count = db.movie.find().count() # Finding all movies which match this genre
			results = list(db.movie.find().limit(10).skip(randrange(0, result_count))) # .sort([('imdbVotes', -1), ('imdbRating', -1)])

			results = sorted(results, key=operator.itemgetter('imdbVotes', 'imdbRating'), reverse=True) # Sort the list of dicts.

			combined_json_list = []
			imdbID_list = []

			currentTime = pendulum.now() # Getting the time
			timestamp = int(round(currentTime.timestamp())) # Converting to timestamp

			for result in results:
				imdbID_list.append(result['imdbID']) # Logging the imdbID for storing in mongodb
				combined_json_list.append({'imdbID': result['imdbID'],
											 'k_mov_ts': timestamp,
											 'plot': result['plot'],
											 'year': result['year'],
											 'poster_url': result['poster'],
											 'actors': result['actors'],
											 'genres': result['genre'],
											 'director': result['director'],
											 'title': result['title'],
											 'imdbRating': result['imdbRating']})

			clicked_movie_IDs = [] # Intentionally blank!
			voting_intention = [] # Intentionally blank!
			NN_ID = "model_RND" # Change to proper NN_ID once not random!

			db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": imdbID_list, "NN_ID": NN_ID, "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

			google_analytics(request, 'get_random_movie_list_success')
			return {'movies': combined_json_list,
					 'success': True,
					 'valid_key': True,
					 'took': float(hug_timer)}
		else:
			# INVALID GG_ID
			google_analytics(request, 'get_random_movie_list_id_error')
			return {'success': False,
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_random_movie_list_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_ab_value(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Input: gg_id, api_key
	Output: The AB testing option (for switching between RND/NN recommendations)
	URL: http://HOST:PORT/get_ab_value?gg_id=anonymous_google_id&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		ab_temp_value = db.Users.find_one({"gg_id": gg_id})
		if ab_temp_value is not None:
			ab_value = ab_temp_value['ab_testing']
			if ab_value == 0:
				db.Users.update_one({"gg_id": gg_id}, {"$set": {"ab_testing": 1}})
			else:
				db.Users.update_one({"gg_id": gg_id}, {"$set": {"ab_testing": 0}})

			google_analytics(request, 'get_ab_value_success')
			return {'success': True, 'valid_key': True, 'ab_value': ab_value, 'took': float(hug_timer)}
		else:
			# GG_ID is invalid!
			google_analytics(request, 'get_ab_value_id_error')
			return {'success': False, 'valid_key': True, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_ab_value_apikey_error')
		return {'success': False, 'valid_key': False, 'took': float(hug_timer)}

#########################

def build_movie_json(mongodb_result, hug_timer):
	"""
	For reducing the duplicate lines in the 'get_goat_movies' function.
	TODO: Modify nodejs code if integrating this info!
	"""
	combined_json_list = []
	movie_vote_quantities = []

	for result in mongodb_result:
		total_votes = int(result['goat_upvotes'] + result['goat_downvotes'])
		movie_vote_quantities.append(total_votes)

	average_vote_quantity = np.median(movie_vote_quantities)

	for result in mongodb_result:
		goat_score = int((result['goat_upvotes'] / (result['goat_upvotes'] + result['goat_downvotes']))*100)
		total_result_votes = int(result['goat_upvotes'] + result['goat_downvotes'])
		adjusted_goat_score = int(goat_score * (total_result_votes/average_vote_quantity)) # TODO: Figure out a better adjusted goat score!

		combined_json_list.append({'imdbID': result['imdbID'],
									 'year': result['year'],
									 'title': result['title'],
									 'imdb_rating': result['imdbRating'],
									 'runtime': result['runtime'],
									 'upvotes': result['goat_upvotes'],
									 'downvotes': result['goat_downvotes'],
									 'goat_score': adjusted_goat_score})

	return combined_json_list

@hug.get(examples='genres=horror drama&api_key=API_KEY')
def get_goat_movies(genres: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Get a list of the most upvoted (GOAT) movies.
	Input: gg_id, genres, api_key
	URL: http://HOST:PORT/get_goat_movies?genres=%20&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		if ((genres == ' ') | (genres == '%20')):
			result = list(db.movie.find({'goat_upvotes': {"$gt": 1}}).sort([('goat_upvotes', -1)]))[:10]
		else:
			# The uer has input movie genres
			genres.replace('%20', ' ') # Browser pushes ' ', NodeJS pushes '%20'

			if (' ' in genres):
				genres = genres.split(' ') # Splitting the genre string into a list of genres!

			genre_list_check = isinstance(genres, list) # Check if the genres variable is a list (or a single genre string)

			if (genre_list_check == True):
				# Multiple genres detected! Count the quantity of movies w/ all of these genres!
				movie_count = db.movie.find({"genre": {'$all': genres}}).sort([('goat_upvotes', -1)]).count()
			else:
				# Single genre detected! Count how many movies there are w/ this genre
				movie_count = db.movie.find({"genre": genres}).sort([('goat_upvotes', -1)]).count()

			if (movie_count > 0):
				print("greater than 0")
				# Results found!
				if (movie_count >= 10):
					# More than 10 movies found? Let's limit top-k to 10!
					k_limit = 10
				else:
					# Less than 10 movies found? Let's reduce the top-k limit!
					k_limit = movie_count

				if (genre_list_check == True):
					# Multiple genre 'all' search
					result = list(db.movie.find({"genre": {'$all': genres}}).sort([('goat_upvotes', -1)]))[:k_limit]
				else:
					# Single genre search
					result = list(db.movie.find({"genre": genres}).sort([('goat_upvotes', -1)]))[:k_limit]
			else:
				# No results, provide json result for nodejs to detect!
				google_analytics(request, 'get_goat_movies_no_movies_found')
				return {'success': False,
						'valid_key': True,
						'took': float(hug_timer)}

		goat_movies = build_movie_json(result, hug_timer)
		sorted_goat_movies = sorted(goat_movies, key=itemgetter('goat_score'), reverse=True)

		google_analytics(request, 'get_goat_movies_success')
		return {'goat_movies': sorted_goat_movies,
				'success': True,
				'valid_key': True,
				'took': float(hug_timer)}

	else:
		# API KEY INVALID!
		google_analytics(request, 'get_goat_movies_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}
