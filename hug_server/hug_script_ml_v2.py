# Required for NN
import numpy as np
import pandas
import os
import zipfile
import requests
import time

# Required for rest of hug scripts
from pymongo import *
from random import *
import pendulum
import hug

client = MongoClient("MONGODB_SEVER_DETAILS")
db = client.popcorndb

# Declare the Google Cloud Model here?

#link imdbID to movielens
base_folder = './ml-20m' # NOTE: The 20m links.csv is only 250KB!
links = pandas.read_csv(base_folder +'/links.csv', engine='python', sep=',') # Retrieving the 'links' csv file to match tmdb:imdb ids.
prepend_imdb_tag = 'tt' #Required prepended tag
prepended_imdbID = links['imdbId'].apply(lambda x: prepend_imdb_tag + str(int(x)).zfill(7)) # Creating the same imdbID format which are present in mongodb

links_dict = dict(zip(list(prepended_imdbID), list(links['movieId']))) # Used to convert imdbIDs to movieLens Ids
reverse_dict = dict(zip(list(links['movieId']), list(prepended_imdbID))) # Opposite of the links_dict to convert the movielens IDs back to imdbIDs!

def get_user_id_by_gg_id(gg_id):
    """
    Find an userID, given an anonymous google ID.
    """
    temp_user_id = db.Users.find_one({'gg_id': gg_id},{'_id':0,'userId':1})
    if temp_user_id is not None:
        return int(temp_user_id["userId"])
    else:
        return None

def get_voted_movie_by_user_id(user_id):
    """
    Retrieve the list of movies
    TODO:
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

#########################################
## Only focus on the following 2

def ml_movie_recomendation (QUERY_USER_ID, QUERY_RATED_MOVIE_IDS, QUERY_RATED_MOVIE_SCORES, QUERY_RATED_GENRE_IDS, QUERY_RATED_GENRE_FREQS, QUERY_RATED_GENRE_AVG_SCORES):
    """
    Produces a list of movie recommendations (IMDB IDs)
    https://github.com/GoogleCloudPlatform/cloudml-samples/blob/master/movielens/trainer/task.py#L63
    """
    movie_ids = []

    # @Jeff TODO: Insert Google cloud ml request code.

    return movie_ids

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def movie_recommendation(genres: hug.types.text, gg_id: hug.types.text, api_key: hug.types.text, hug_timer=120):
    """
    Input: gg_id, api_key
    Output: Ten NN predicted top-k movies!
    URL: http://HOST:PORT/get_nn_list?gg_id=anonymous_google_id&api_key=API_KEY
    """
    if (check_api_token(api_key) == True):
        # API KEY VALID
        user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID (incremental)
        if user_id is not None:
            rating_training = db.user_ratings.find({'userId': user_id},{'_id':0}) # Retrieving the user's movie ratings
            rating_training = list(rating_training)

			genres.replace('%20', ' ') # Browser pushes ' ', NodeJS pushes '%20'
			if (' ' in genres):
				genres = genres.split(' ') # Splitting the genre string into a list of genres!

            if len(rating_training) >= 5):  # Minimum of 5 votes for Google cloud model to work!
                # The user id.
                QUERY_USER_ID = user_id #'query_user_id'

                # Implemented Vote Goat genre names
                # TODO: Allocate IDs to the following genres
                Genres = ['Action','Adventure','Animation','Biography','Comedy','Crime','Documentary','Drama','Family','Fantasy','Film-Noir','Horror','Musical','Mystery','Romance','Sci-Fi','Short','Sport','Thriller','War','Western']

                Genre_Dict = {}

                for i in range(len(Genres))
                    """
                    Creating a dict for matching genre string to id & keeping track of genre ratings
                    output: ['id': {'name': name, 'upvotes': x, 'downvotes': y}]
                    """
                    iterator = str(i)
                    Genre_Dict[iterator] = {
                    'name': Genres[i],
                    'upvotes': 0,
                    'downvotes': 0
                    }

                """
                # NOTE: Movielens movie rating dataset uses different id from IMDB.
                # @Jeff - Should we either:
                # * Pre-process the movielens dataset & change the google cloud movie recommendation repo code to use IMDB Ids instead of movielens Ids?
                # * Just conver the IMDB Ids here to Movielens Ids using the following code:
                """
                QUERY_RATED_MOVIE_IDS = [] # ['id', 'id', ...]

                # The scores on the rated movies given by the user.
                QUERY_RATED_MOVIE_SCORES = [] # [1, 0, ...]

                # The set of genres of the rated movies.
                # @Jeff: Is this supposed to be a count of genre occurrence, or (up/up+down) type formula?
                # QUERY_RATED_GENRE_IDS = 'query_rated_genre_ids' # TODO: ID? 'genre' || '001' # [1, 2, ...]

                QUERY_RATED_GENRE_IDS = range(len(Genres)) # Is this just supposed to be the Genre IDs?

                for rating_entry in rating_training:
                    """
                    Extracting information from retrieved ratings, stored into lists & dict.
                    """
                    QUERY_RATED_MOVIE_IDS.append(rating_entry['imdbID'])
                    QUERY_RATED_MOVIE_SCORES.append(rating_entry['rating'])

                    for rated_movie_genres in rating_entry['genres']:
                        if (rating_entry['rating'] == 1):
                            Genre_Dict[str(rated_movie_genres)]['upvotes']++
                        else:
                            Genre_Dict[str(rated_movie_genres)]['downvotes']++

                QUERY_RATED_MOVIE_IDS = list(map(links_dict.get, QUERY_RATED_MOVIE_IDS)) # Converting IMDBIds to Mobielens Ids

                # The number of times the user rated each genre.
                QUERY_RATED_GENRE_FREQS = [] # [32, 2, ...]
                # The average rating on each genre.
                QUERY_RATED_GENRE_AVG_SCORES = [] # TODO: Average rating between 0 & 1, or upvotes/upvotes+downvotes ? # Assume: [int, int, ...]

                for i in range(len(Genre_Dict)):
                    """
                    By this point we've analyzed the user's ratings, outputting genre freqs & avg score (up/up+down)
                    """
                    upvotes = Genre_Dict[str(i)]['upvotes']
                    downvotes = Genre_Dict[str(i)]['upvotes']
                    total_votes = upvotes + downvotes
                    QUERY_RATED_GENRE_FREQS.append(total_votes)
                    QUERY_RATED_GENRE_AVG_SCORES.append(upvotes/total_votes)

                # Producing a list of movie recommendations
                recomended_movie_ids = ml_movie_recomendation(QUERY_USER_ID, QUERY_RATED_MOVIE_IDS, QUERY_RATED_MOVIE_SCORES, QUERY_RATED_GENRE_IDS, QUERY_RATED_GENRE_FREQS, QUERY_RATED_GENRE_AVG_SCORES)

                # NOTE: Perhaps best to perform top-k reduction before the next step?
                recomended_movie_ids = list(map(reverse_dict.get, recomended_movie_ids)) # Converting the top-k list movie IDs from movielens/tmdb back to imdbID
            else: # Below minimum
                # The user has not yet voted 5 times
			    genre_list_check = isinstance(genres, list) # Check if the genres variable is a list (or a single genre string)

    			# Multiple genres detected! Count the quantity of movies w/ all of these genres!
                if (genre_list_check):
                    # Multiple movie genres!
                    movie_count = db.movie.find({"genre": {'$all': genres}}).count()
    			else if (!genre_list_check):
    				# Single genre detected! Count how many movies there are w/ this genre
    			    movie_count = db.movie.find({"genre": genres}).count()
                else if ((genres == ' ') | (genres == '%20')):
                    movie_count = db.movie.find().count()

    			if (movie_count > 2): # Minimum of 2 items in the carousel response!
    				# More than 2 results were found!
                    if (movie_count < 9):
                        k_limit = movie_count
                    else:
                        k_limit = 9

    				if (genre_list_check):
    					# Multiple genre 'all' search
    					results = db.movie.find({"genre": {'$all': genres}})[:k_limit]
    				else if (!genre_list_check):
    					# Single genre search
    					results = db.movie.find({"genre": genres})[:k_limit]
                    else if ((genres == ' ') | (genres == '%20')):
                        # No genres input
                    	results = list(db.movie.find().limit(10).skip(randrange(0, result_count))) # .sort([('imdbVotes', -1), ('imdbRating', -1)])
                    	results = sorted(results, key=operator.itemgetter('imdbVotes', 'imdbRating'), reverse=True) # Sort the list of dicts.

                	recomended_movie_ids = []

                	for result in results:
                		recomended_movie_ids.append({'imdbID': result['imdbID'])
    			else:
    				# No results, provide json result for nodejs to detect!
    				return {'success': False,
    						'valid_key': True,
    						'took': float(hug_timer)}

            # Now to produce JSON consumable by Firebase
            combined_json_list = [] # Empty list where we'll store the top-k movie json items
            currentTime = pendulum.now() # Getting the time
            timestamp = int(round(currentTime.timestamp())) # Converting to timestamp, rounding it & converting to int

            for movie_id in recomended_movie_ids: # Loop over the top-k results
                result = db.movie.find_one({"imdbID": movie_id}) # Retrieve movie given the imdb ID from the top-k list

                combined_json_list.append({'imdbID': result['imdbID'], # Store each movie's metadata record in a list
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
            ML_ID = "Google Cloud Model" # TODO: Rename automatically to latest model name somehow?

            db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": k_imdb_id, "ML_ID": files[0], "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

            return {'movies': combined_json_list,
                    'success': True,
                    'valid_key': True,
                    'took': float(hug_timer)}

        else:
            # INVALID gg_id
            return {'success': False,
                    'valid_key': True,
                    'took': float(hug_timer)}
    else:
        # API KEY INVALID!
        return {'success': False,
                'valid_key': False,
                'took': float(hug_timer)}
