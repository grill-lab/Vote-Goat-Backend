# Required for rest of hug scripts
import pymongo
from pymongo import *
from random import *
import numpy as np
import pendulum
import hug
import json
import ujson
import uuid
import operator
import requests
from operator import itemgetter

client = MongoClient("MONGODB_SEVER_DETAILS"")
db = client.votegoat

###########

def google_analytics(request, function_name):
	"""
	# Tracking usage via Google Analytics (using the measurement protocol).
	# Why? Because the only insight into the use of HUG currently is the access & error logs (insufficient).
	"""
  google_analytics_code = 'google_analytics_code'
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
		# Attempting to POST the above payload to Google Analytics.
		r = requests.post('https://www.google-analytics.com/collect', params=payload, headers=headers)
		if (r.status_code == requests.codes.ok):
			# Successful POST!
			print("Successful G.A. POST!")
		else:
			# Unsuccessful POST!
			print("Unsuccessful G.A. POST! {}".format(function_name))
	except:
		# Unsuccessful POST!
		print("Unsuccessful G.A. POST! {}".format(function_name))

########### Helper functions

def generate_ml_id():
	"""
	Generate a new ID which will be compatible with the machine learning components.
	"""
	user_count = db.Users.find().count()
	return user_count + 1

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
	Retrieve the list of movies the user has rated (imdbIDs)
	"""
	movie_list = list(db.user_ratings.find({'userId': user_id}))
	tmp_list = []
	for movie in movie_list:
		tmp_list.append(movie["imdbID"])

	return tmp_list

def check_api_token(api_key):
	"""
	Check if the user's API key is valid.
	"""
  if (api_key == 'HUG_REST_API_KEY'):
		return True
	else:
		return False

########### Below: HUG functions!

@hug.post(examples='gg_id=anonymous_google_id&api_key=API_KEY')
@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def create_user(gg_id: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""
	Creating an user in the mongodb database.
	URL: https://HOST:PORT/create_user?gg_id=anonymous_google_id&api_key=API_KEY
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

@hug.post(examples='gg_id=anonymous_google_id&movie_id=tt000001&rating=0&mode=training&conv_id=12345&raw_vote=RAW_VOTE&sigir=0&api_key=API_KEY')
@hug.get(examples='gg_id=anonymous_google_id&movie_id=tt000001&rating=0&mode=training&conv_id=12345&raw_vote=RAW_VOTE&sigir=0&api_key=API_KEY')
def submit_movie_rating(gg_id: hug.types.text, movie_id: hug.types.text, rating: hug.types.number, mode: hug.types.text, conv_id: hug.types.number, raw_vote: hug.types.text, sigir: hug.types.number, request, api_key: hug.types.text, hug_timer=5):
	"""
	Submitting an user movie rating to mongodb.
	URL: https://HOST:PORT/submit_movie_rating?gg_id=anonymous_google_id&movie_id=tt000001&rating=1&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.
		if user_id is not None:
			if (db.movie.find({"imdbID": movie_id}).count() > 0):
				result = db.user_ratings.find({"$and": [{"userId": user_id}, {"imdbID": movie_id}]}).count()

				if (mode == 'list_selection'):
					# User is in the recommendation section & they just voted!
					latest_usr_rec_ts = list(db.recommendation_history.find({"userId": user_id}).sort('k_mov_timestamp', -1).limit(1))[0]['k_mov_timestamp'] # Getting the user's last recommendation session timestamp
					print("Movie rating timestamp DEBUG: {}".format(latest_usr_rec_ts))
					db.recommendation_history.update_one({"userId": user_id, "k_mov_timestamp": latest_usr_rec_ts}, {"$set": {"voted": rating}}) # Recording the user's vote within the recommendation section

				currentTime = pendulum.now() # Getting the time (SIGIR)
				current_time = int(round(currentTime.timestamp())) # Converting to timestamp (SIGIR)

				if (result == 0):	# User hasn't rated thisl movie yet.
					movie_genres = list(db.movie.find({"imdbID": movie_id}))[0]['genre'] # Including the movie genres in the user ratings for ML movie recommendations
					db.user_ratings.insert_one({"userId": user_id, "imdbID": movie_id, "rating": rating, "genres": movie_genres, "timestamp": current_time, "conversation_id": conv_id, "raw_vote": raw_vote})

					user_genre_tally_data = db.user_genre_vote_tally.find({"userId": user_id})

					if (rating == 1):
						db.Users.update_one({"userId": user_id, "gg_id": gg_id}, {"$inc": {"total_movie_votes": 1, "total_movie_upvotes": 1}}) # Updating the user's voting stats

						if (current_time >= 1531033200) and (current_time < 1531479600) and (sigir == 1):
							# SIGIR attendee
							db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_upvotes": 1, "sigir_upvotes": 1, "total_goat_votes": 1, "total_sigir_votes": 1}}) # Updating the movie's voting stats
						else:
							# Normal user
							db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_upvotes": 1, "total_goat_votes": 1}}) # Updating the movie's voting stats
					else:
						db.Users.update_one({"userId": user_id, "gg_id": gg_id}, {"$inc": {"total_movie_votes": 1, "total_movie_downvotes": 1}}) # Updating the user's voting stats

						if (current_time >= 1531033200) and (current_time < 1531479600) and (sigir == 1):
							# SIGIR attendee
							db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_downvotes": 1, "sigir_downvotes": 1, "total_goat_votes": 1, "total_sigir_votes": 1}}) # Updating the movie's voting stats
						else:
							# Normal user
							db.movie.update_one({"imdbID": movie_id}, {"$inc": {"goat_downvotes": 1, "total_goat_votes": 1}}) # Updating the movie's voting stats

						inc_object = {}

						for genre in movie_genres: # Tallying genre voting data
								if rating == 1:
										direction = 'up'
								else:
										direction = 'down'

								target = str(genre)+'.'+direction
								inc_object[target] = int(1)

						print(inc_object)

						db.user_genre_vote_tally.update_one({"userId": user_id}, {"$inc": inc_object})

					google_analytics(request, 'submit_movie_rating_success')
					#print("Input new rating")
					return {'success': True,
							'valid_key': True,
							'took': float(hug_timer)}

				else: # Rating already exists!
					# Overwrite rating entry using update_one & $set
					#print("Updated existing rating!")
					db.user_ratings.update_one({"userId": user_id, "imdbID": movie_id}, {"$set": {"rating": rating, "timestamp": current_time}})
					google_analytics(request, 'submit_movie_rating_overwritten')
					return {'success': False,
							'error_message': 'Overwrote existing rating!',
							'valid_key': True,
							'took': float(hug_timer)}
			else:
				# There's no movie matching the imdbID
				google_analytics(request, 'submit_movie_rating_imdbId_error')
				error_message = "imdbID '" + str(movie_id) + "' does not exist!"
				return {'success': False,
						'error_message': error_message,
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# No gg_id found
			google_analytics(request, 'submit_movie_rating_id_error')
			return {'success': False,
					'error_message': 'Invalid user Id',
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
	"""Retrieve the user's leaderboard rankings!"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Convert gg_id to their incremental user_ratings userID.
		if user_id is not None:
			user_result = db.Users.find_one({"userId": user_id, "gg_id": gg_id}, {'_id': False})
			leaderboard = list(db.Users.find({}, {'_id': False, 'total_movie_votes': True, 'userId': True}).sort('total_movie_votes', -1)) # Users sorted descending by their total_movie_votes

			#print(leaderboard[0])
			leaderboard_position = leaderboard.index({'total_movie_votes': user_result['total_movie_votes'], 'userId': user_result['userId']}) + 1 # Trying to get the user's leaderboard position
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
					'error_message': 'Invalid user Id',
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
					'error_message': 'Invalid user Id',
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
	URL: https://HOST:PORT/get_user_ratings?gg_id=anonymous_google_id&api_key=API_KEY
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
				return {'user_ratings': combined_json_list,
						'success': True,
						'error_message': '',
						'valid_key': True,
						'took': float(hug_timer)}
			else:
				# User hasn't rated any movies
				google_analytics(request, 'get_user_ratings_fail_no_ratings')
				return {'success': False,
						'error_message': 'No user ratings',
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# gg_id is invalid!
			google_analytics(request, 'get_user_ratings_id_error')
			return {'success': False,
					'error_message': 'Invalid user Id',
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

def no_movies(request, hug_timer):
	# No movie results!
	google_analytics(request, 'get_single_training_movie_no_movies_found')
	return {'success': False,
			'error_message': 'Found no movies (remaining count == 0)',
			'valid_key': True,
			'took': float(hug_timer)}

def process_genres(genres):
	"""
	To process genre parameter - replacing %2C for ","
	"""
	processed_genres = []
	for genre in genres:
		if ('%2C' in genre):
			for individual_genre in genre.split("%2C"):
				processed_genres.append(individual_genre)
			continue
		if (',' in genre):
			for individual_genre in genre.split(","):
				processed_genres.append(individual_genre)
			continue
		else:
			processed_genres.append(genre)
	return processed_genres

@hug.get(examples='gg_id=anonymous_google_id&sort_target=imdbVotes&sort_direction=DESCENDING&genres=horror,drama&api_key=API_KEY')
def get_single_training_movie(gg_id: hug.types.text, sort_target: hug.types.text, sort_direction: hug.types.text, genres: hug.types.multiple, api_key: hug.types.text, request, hug_timer=20):
	"""
	Get a single movie for the training bot section.
	Retrieves a list of movies the user has previously voted for, used as a filter!
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID

		allowed_targets = ["title","year","released","awards","boxoffice","imdbID","imdbRating","imdbVotes","metascore","goat_upvotes","goat_downvotes","total_goat_votes","sigir_upvotes","sigir_downvotes","total_sigir_votes"]
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

			if (sort_direction == "DESCENDING"):
				sorting = DESCENDING
			else:
				sorting = ASCENDING

			#print("GENRES: {}".format(genres))

			if ((genres == []) | (genres == ["%2C"]) | (genres == [","])):
				# User entered no genres
				remaining_count = db.movie.find({'imdbID': {'$nin': imdb_list}}).count()
				if (remaining_count > 0):
					#print("Successful movie without genre")
					result = db.movie.find({'imdbID': {'$nin': imdb_list}}, {'_id': False}).sort(sort_target, sorting).limit(1)
				else:
					#print("NO non-genre movies")
					return no_movies(request, hug_timer)
			else:
				genres = process_genres(genres)
				# User has entered genres
				remaining_count = db.movie.find({"$and": [{"imdbID": {"$nin": imdb_list}}, {"genre": {'$all': genres}}]}).count()
				if (remaining_count > 0):
					# Results found! Return 1 result to the user.
					if (len(genres) > 1):
						#print("genre A")
						# More than 1 genre
						result = db.movie.find({"$and": [{"imdbID": {"$nin": imdb_list}}, {"genre": {'$all': genres}}]}, {'_id': False}).sort(sort_target, sorting).limit(1)
					else:
						#print("genre B")
						# Only 1 genre
						result = db.movie.find({"$and": [{"imdbID": {"$nin": imdb_list}}, {"genre": genres}]}, {'_id': False}).sort(sort_target, sorting).limit(1)
				else:
					return no_movies(request, hug_timer)

			# Let's log then build the movie response!
			google_analytics(request, 'get_single_training_movie_success')
			return build_training_response(list(result)[0], hug_timer, remaining_count)
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
	URL: https://HOST:PORT/log_clicked_item?gg_id=anonymous_google_id&k_mov_ts=1512485806.920382&clicked_movie=tt000001&api_key=API_KEY
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID

		if user_id is not None:
			if (db.recommendation_history.find({"$and": [{"userId": user_id}, {"k_mov_timestamp": k_mov_ts}]}).count() > 0):
				# The recommendation history item exists!
				db.recommendation_history.update_one({"userId": user_id, "k_mov_timestamp": k_mov_ts}, {"$set": {"clicked_movie_IDs": clicked_movie}})
				google_analytics(request, 'log_clicked_item_success')
				return {'success': True,
						'valid_key': True,
						'took': float(hug_timer)}
			else:
				# The recommendation history item did not exist!
				google_analytics(request, 'log_clicked_item_non_existent')
				return {'success': False,
						'error_message': 'No recommendation history item exists.',
						'valid_key': True,
						'took': float(hug_timer)}
		else:
			# Invalid GG_ID
			google_analytics(request, 'log_clicked_item_id_error')
			return {'success': False,
					'error_message': 'Invalid UserId',
					'valid_key': True,
					'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'log_clicked_item_apikey_error')
		return {'success': False,
				'error_message': 'Invalid API KEY!',
				'valid_key': False,
				'took': float(hug_timer)}

@hug.get(examples='gg_id=anonymous_google_id&experiment_id=1&experiment_group=0&genres=Action,Horror&sort_target=imdbVotes&sort_direction=DESCENDING&api_key=API_KEY')
def get_random_movie_list(gg_id: hug.types.text, experiment_id: hug.types.number, experiment_group: hug.types.number, genres: hug.types.multiple, sort_target: hug.types.text, sort_direction: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""Produces a list of random movies (with more than 1 imdbVotes)."""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID (incremental)
		if user_id is not None:
			if (sort_direction == "DESCENDING"):
				sorting = DESCENDING
			else:
				sorting = ASCENDING

			if ((genres == []) | (genres == ["%2C"]) | (genres == [","])):
				#print("A")
				movie_count = db.movie.find({sort_target: {"$gt": 1}}, {'_id': False}).count()
				if (movie_count >= 10):
					result_count = 10
				else:
					result_count = movie_count

				random_results = []
				for movie in range(result_count):
					if movie_count > 500:
						random_results.append(list(db.movie.find({sort_target: {"$gt": 1}}, {'_id': False}).sort(sort_target, sorting).limit(1).skip(randint(0, int(movie_count/5))))[0])
					else:
						random_results.append(list(db.movie.find({sort_target: {"$gt": 1}}, {'_id': False}).sort(sort_target, sorting).limit(1).skip(randint(0, movie_count)))[0])
			else:
				#print("B")
				genres = process_genres(genres)

				movie_count = db.movie.find({"$and": [{sort_target: {"$gt": 1}}, {"genre": {'$all': genres}}]}).count()

				if (movie_count >= 10):
					result_count = 10
				else:
					result_count = movie_count

				random_results = []
				for movie in range(result_count):
					if movie_count > 500:
						random_results.append(list(db.movie.find({"$and": [{sort_target: {"$gt": 1}}, {"genre": {'$all': genres}}]}, {'_id': False}).sort(sort_target, sorting).limit(1).skip(randint(0, int(movie_count/5))))[0])
					else:
						random_results.append(list(db.movie.find({"$and": [{sort_target: {"$gt": 1}}, {"genre": {'$all': genres}}]}, {'_id': False}).sort(sort_target, sorting).limit(1).skip(randint(0, movie_count)))[0])

			random_results = sorted(random_results, key=operator.itemgetter('imdbVotes', 'imdbRating'), reverse=True) # Sort the list of dicts.

			if (len(random_results) <= 2):
				google_analytics(request, 'get_random_movie_list_insufficient_movies')
				return {'success': False,
						'error_message': 'Insufficient movies',
						'valid_key': True,
						'took': float(hug_timer)}

			combined_json_list = []
			imdbID_list = []

			currentTime = pendulum.now() # Getting the time
			timestamp = int(round(currentTime.timestamp())) # Converting to timestamp

			for result in random_results:
				imdbID_list.append(result['imdbID']) # Logging the imdbID for storing in mongodb
				combined_json_list.append({'imdbID': result['imdbID'],
											 'k_mov_ts': timestamp,
											 'plot': result['plot'],
											 'year': result['year'],
											 'rate_desc': result['rate_desc'],
											 'poster_url': result['poster'],
											 'actors': result['actors'],
											 'genres': result['genre'],
											 'director': result['director'],
											 'title': result['title'],
											 'imdbRating': result['imdbRating'],
											 'imdbVotes': result['imdbVotes']})

			clicked_movie_IDs = "" # Intentionally blank!
			voting_intention = "" # Intentionally blank!
			NN_ID = "model_RND" # Change to proper NN_ID once not random!

			db.recommendation_history.insert_one({"userId": user_id, "experiment_id": experiment_id, "experiment_group": experiment_group, "k_movie_list": imdbID_list, "NN_ID": NN_ID, "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

			google_analytics(request, 'get_random_movie_list_success')
			return {'movies': combined_json_list,
					 'success': True,
					 'valid_key': True,
					 'took': float(hug_timer)}
		else:
			# INVALID GG_ID
			google_analytics(request, 'get_random_movie_list_id_error')
			return {'success': False,
					'error_message': 'Invalid user Id',
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
	URL: https://HOST:PORT/get_ab_value?gg_id=anonymous_google_id&api_key=API_KEY
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
			return {'success': False, 'error_message': 'Invalid user Id', 'valid_key': True, 'took': float(hug_timer)}
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
		#print(result)
		total_votes = int(result['goat_upvotes'] + result['goat_downvotes'])
		movie_vote_quantities.append(total_votes)

	#median_vote_quantity = np.median(movie_vote_quantities)
	mean_vote_quantity = np.mean(movie_vote_quantities)
	std_deviation = np.std(movie_vote_quantities)

	for result in mongodb_result:
		total_result_votes = int(result['goat_upvotes'] + result['goat_downvotes'])
		goat_score = int((result['goat_upvotes'] / total_result_votes)*100) # % of votes that are upvotes

		#absolute_diff = abs(total_result_votes - median_vote_quantity) # Median vs Mean for identifying outliers?
		absolute_diff = abs(total_result_votes - mean_vote_quantity) # Median vs Mean for identifying outliers?

		if (absolute_diff <= 2*std_deviation):
			# If within 2 std deviations, don't punish goat_score!
			adjustment = 1
		else:
			# If they have greater than 2*std_deviation then we punish their score
			adjustment = 1 - (((absolute_diff/std_deviation) - 2) * 0.1) # 10% per 1 std dev past 2nd

		adjusted_goat_score = int(goat_score * adjustment)

		combined_json_list.append({'imdbID': result['imdbID'],
									 'year': result['year'],
									 'title': result['title'],
									 'imdb_rating': result['imdbRating'],
									 'runtime': result['runtime'],
									 'upvotes': result['goat_upvotes'],
									 'downvotes': result['goat_downvotes'],
									 'adustment': adjustment,
									 'goat_score': adjusted_goat_score})

	return combined_json_list

@hug.get(examples='genres=horror,drama&vote_target=goat_upvotes&api_key=API_KEY')
def get_goat_movies(genres: hug.types.multiple, vote_target: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""Get a list of the most upvoted (GOAT) movies."""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		# TODO: Enable multiple vote targets, to sort by multiple indexes.
		allowed_vote_targets = ["goat_upvotes", "goat_downvotes", "total_goat_votes", "sigir_upvotes", "sigir_downvotes", "total_sigir_votes", "imdbVotes"] # Allowed GOAT vote targets
		if vote_target in allowed_vote_targets:
			# Allowed vote target

			if ((genres == []) | (genres == ["%2C"]) | (genres == [","])):
				movie_count = db.movie.find({vote_target: {"$gt": 1}}).count()

				if (movie_count > 0):
					result = list(db.movie.find({vote_target: {"$gt": 1}}).sort(vote_target, pymongo.DESCENDING).limit(10))
				else:
					# No results, provide json result for nodejs to detect!
					google_analytics(request, 'get_goat_movies_no_movies_found')
					return {'success': False,
							'error_message': 'No movie results',
							'valid_key': True,
							'took': float(hug_timer)}
			else:
				genres = process_genres(genres)
				# The uer has input movie genres
				if (len(genres) > 1):
					# Multiple genres detected! Count the quantity of movies w/ all of these genres!
					movie_count = db.movie.find({"$and": [{vote_target: {"$gt": 1}}, {"genre": {'$all': genres}}]}).count()
				else:
					# Single genre detected! Count how many movies there are w/ this genre
					movie_count = db.movie.find({"$and": [{vote_target: {"$gt": 1}}, {"genre": genres}]}).count()

				if (movie_count > 0):
					# Results found!
					if (movie_count >= 10):
						# More than 10 movies found? Let's limit top-k to 10!
						k_limit = 10
					else:
						# Less than 10 movies found? Let's reduce the top-k limit!
						k_limit = movie_count

					if (len(genres) > 1):
						# Multiple genre 'all' search
						result = list(db.movie.find({"$and": [{vote_target: {"$gt": 1}}, {"genre": {'$all': genres}}]}).sort(vote_target, pymongo.DESCENDING).limit(k_limit))
					else:
						# Single genre search
						result = list(db.movie.find({"$and": [{vote_target: {"$gt": 1}}, {"genre": genres}]}).sort(vote_target, pymongo.DESCENDING).limit(k_limit))
				else:
					# No results, provide json result for nodejs to detect!
					google_analytics(request, 'get_goat_movies_no_movies_found')
					return {'success': False,
							'error_message': 'No movie results',
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
			# Not allowed to sort GOAT movies by this
			google_analytics(request, 'get_goat_movies_invalid_vote_target')
			return {'success': False,
					'error_message': 'Invalid vote target',
					'valid_key': True,
					'took': float(hug_timer)}

	else:
		# API KEY INVALID!
		google_analytics(request, 'get_goat_movies_apikey_error')
		return {'success': False,
				'valid_key': False,
				'took': float(hug_timer)}

################### ALPHA:

@hug.get(examples='intent=Recommendation&api_key=API_KEY')
def get_experiment_values(intent: hug.types.text, api_key: hug.types.text, request, hug_timer=5):
	"""Enable triggering different HUG functions for the Vote Goat movie recommendation intent."""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		if (db.experiment_tracker.find({'intent': intent}).count() > 0):
			google_analytics(request, 'get_experiment_value_success')

			latest_experiment = list(db.experiment_tracker.find({'intent': intent}, {'_id': 0}).sort('experiment_id', DESCENDING))[0]

			return {'experiment_details': {'intent': latest_experiment['intent'], 'experiment_id': latest_experiment['experiment_id'], 'target_hug_function':latest_experiment['target_hug_function'], 'target_hug_parameters':latest_experiment['target_hug_parameters'], 'probabilities':latest_experiment['probabilities']}, 'success': True, 'valid_key': True, 'took': float(hug_timer)}
		else:
			google_analytics(request, 'get_experiment_value_fail')
			return {'success': False, 'error_message': 'Failed to retrieve an experiment!', 'valid_key': True, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'get_experiment_value_apikey_error')
		return {'success': False, 'valid_key': False, 'took': float(hug_timer)}

@hug.get(examples='intent=Recommendation&function_0=get_random_movie_list&function_1=get_random_movie_list&parameters_0=key1:val1,key2:val2&parameters_1=key1:val1,key2:val2&probability_0=80&probability_1=20&api_key=API_KEY')
def create_experiment_values(intent: hug.types.text, api_key: hug.types.text, function_0: hug.types.text, function_1: hug.types.text, parameters_0: hug.types.multiple, parameters_1: hug.types.multiple, probability_0: hug.types.number, probability_1: hug.types.number, request, hug_timer=5):
	"""Create experiments on the fly! You can specify 2 different HUG functions & different parameters for both. Assign an integer value for each, reating a custom ratio of A:B occurrence."""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		quantity_existing_experiments = db.experiment_tracker.find().count()
		experiment_id = quantity_existing_experiments + 1

		if parameters_0 != [' ']:
			parameter_holder = {}
			for parameter in parameters_0:
				keyval = parameter.split(":")
				parameter_holder[keyval[0]] = keyval[1]
			parameters_0 = parameter_holder
		else:
			parameters_0 = {}

		if parameters_1 != [' ']:
			parameter_holder = {}
			for parameter in parameters_1:
				keyval = parameter.split(":")
				parameter_holder[keyval[0]] = keyval[1]
			parameters_1 = parameter_holder
		else:
			parameters_1 = {}

		google_analytics(request, 'create_experiment_values_success')
		db.experiment_tracker.insert_one({'intent': intent, 'experiment_id': experiment_id, 'target_hug_function': {str(0):function_0, str(1):function_1},'target_hug_parameters': {str(0): parameters_0, str(1): parameters_1}, 'probabilities': {str(0): probability_0, str(1): probability_1}})
		return {'success': True, 'valid_key': True, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		google_analytics(request, 'create_experiment_value_apikey_error')
		return {'success': False, 'error_message': 'Invalid API Key', 'valid_key': False, 'took': float(hug_timer)}
