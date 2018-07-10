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
db = client.votegoat

# Declare the Google Cloud Model here?

#link imdbID to movielens
base_folder = './ml-20m' # NOTE: The 20m links.csv is only 250KB!
links = pandas.read_csv(base_folder +'/links.csv', engine='python', sep=',') # Retrieving the 'links' csv file to match tmdb:imdb ids.
prepend_imdb_tag = 'tt' #Required prepended tag
prepended_imdbID = links['imdbId'].apply(lambda x: prepend_imdb_tag + str(int(x)).zfill(7)) # Creating the same imdbID format which are present in mongodb

links_dict = dict(zip(list(prepended_imdbID), list(links['movieId']))) # links.csv dictionary used to convert imdbIDs to movieLens Ids
reverse_dict = dict(zip(list(links['movieId']), list(prepended_imdbID))) # Opposite of the links_dict - for convert movieLens IDs back to imdbIDs!

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

def process_multiple(input_multiple):
	"""
	To process multiple parameter - replacing %2C for ","
	Might as well be using the text type.. perhaps we're not using the multiple type correctly?
	"""
	processed_strings = []
	for multiple in input_multiple:
		if ('%2C' in multiple):
			for individual_string in multiple.split("%2C"):
				processed_strings.append(individual_string)
			continue
		if (',' in multiple):
			for individual_string in multiple.split(","):
				processed_strings.append(individual_string)
			continue
		else:
			processed_strings.append(multiple)
	return processed_strings

#########################################
## Only focus on the following 2

def ml_movie_recomendation (QUERY_USER_ID, QUERY_RATED_MOVIE_IDS, QUERY_RATED_MOVIE_SCORES, QUERY_RATED_GENRE_IDS, QUERY_RATED_GENRE_FREQS, QUERY_RATED_GENRE_AVG_SCORES):
    """Produces a list of movie recommendations (IMDB IDs) https://github.com/GoogleCloudPlatform/cloudml-samples/blob/master/movielens/trainer/task.py#L63"""
    movie_ids = []

    # @Jeff TODO: Insert Google cloud ml request code.

    return movie_ids

@hug.get(examples='genres=Action,Horror,Comedy&gg_id=anonymous_google_id&api_key=API_KEY')
def movie_recommendation(genres: hug.types.multiple, gg_id: hug.types.text, api_key: hug.types.text, hug_timer=120):
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

            if len(rating_training) >= 5):  # Minimum of 5 votes for Google cloud model to work!
                # The user id.
                QUERY_USER_ID = user_id #'query_user_id'

                # Implemented Vote Goat genre names
                # TODO: Allocate IDs to the following genres
                # TODO: VERIFY movielens genres are the same - I don't think they count 'News'..
                all_possible_genres = ['Action','Adventure','Animation','Biography','Comedy','Crime','Documentary','Drama','Family','Fantasy','Film-Noir','Horror','Music','Musical','Mystery','News','Romance','Sci-Fi','Short','Sport','Thriller','War','Western']

                # The set of genres of the rated movies.
                # TODO: QUERY_RATED_GENRE_IDS - existing IDs for genres in ML? Or can we sort by alphabetical order then just get the index in list as genre Id?
                QUERY_RATED_GENRE_IDS = range(len(all_possible_genres)) # Is this just supposed to be the Genre IDs?

                QUERY_RATED_MOVIE_IDS = [] # ['id', 'id', ...] - imdbIDs - need converted to TMDB movie id on the fly
                QUERY_RATED_MOVIE_SCORES = [] # [1, 0, ...] - The scores on the rated movies given by the user.

                for rating_entry in rating_training:
                    """
                    Extracting information from retrieved ratings
                    """
                    QUERY_RATED_MOVIE_IDS.append(rating_entry['imdbID'])
                    QUERY_RATED_MOVIE_SCORES.append(rating_entry['rating'])

                QUERY_RATED_MOVIE_IDS = list(map(links_dict.get, QUERY_RATED_MOVIE_IDS)) # Converting IMDBIds to Mobielens Ids
                QUERY_RATED_GENRE_FREQS = [] # [32, 2, ...] The number of times the user rated each genre.
                QUERY_RATED_GENRE_AVG_SCORES = [] # [int, int, ...] The average rating on each genre.

                user_vote_tallies = db.user_genre_vote_tally.find({"userId": QUERY_USER_ID}, {'_id': 0}) # Remove id via project

                """
                user_vote_tallies has the following JSON format (reduced to 1 genre)
                {
                    "Genre" : {
                        "up" : NumberInt(114),
                        "down" : NumberInt(45)
                    }
                }
                """
                
                for genre in all_possible_genres:
                    """
                    By this point we've analyzed the user's ratings, outputting genre freqs & avg score (up/up+down)
                    # @Jeff TODO: cloud movielens sample uses ratings 0-5 (0.5 increments), we use 0|1
                    # TODO: Verify order of input genres - does movielens require a specific order?
                    """
                    upvotes = user_vote_tallies[genre]['up']
                    downvotes = user_vote_tallies[genre]['down']
                    total_votes = upvotes + downvotes
                    QUERY_RATED_GENRE_FREQS.append(total_votes)
                    QUERY_RATED_GENRE_AVG_SCORES.append(upvotes/total_votes)
                    # TODO: Average rating between 0 & 1, or upvotes/upvotes+downvotes ? # Assume:

                # Producing a list of movie recommendations
                # TODO: complete 'ml_movie_recomendation' function
                recomended_movie_ids = ml_movie_recomendation(QUERY_USER_ID, QUERY_RATED_MOVIE_IDS, QUERY_RATED_MOVIE_SCORES, QUERY_RATED_GENRE_IDS, QUERY_RATED_GENRE_FREQS, QUERY_RATED_GENRE_AVG_SCORES)

                # NOTE: Perhaps best to perform top-k reduction before the next step?
                recomended_movie_ids = list(map(reverse_dict.get, recomended_movie_ids)) # Converting the top-k list movie IDs from movielens/tmdb back to imdbID

                # Parsing the user input genres (if any exist)
        		if ((genres != []) and (genres != ["NONE"])):
        			# The user has provided genre parameter data
                    find_and_list = []
                    find_and_list.append({"imdbID": {"$in": recomended_movie_ids}}) # We only want to pick from the requested movies

                    genres = process_multiple(genres)
        			if (len(genres) > 1):
        				# Multiple genres!
        				find_and_list.append({"genre": {'$all': genres}})
        			else:
        				# Only the 1 genre
        				find_and_list.append({"genre": genres})

                    movie_results = db.movie.find({"$and": find_and_list}, {'_id': 0, 'imdbID': 1, 'plot': 1, 'year': 1, 'poster': 1, 'actors': 1, 'genre': 1, 'director': 1, 'title': 1, 'imdbRating': 1}).limit(10) # Limiting to max 10 results
                else:
                    # The user hasn't provided any movie genre input parameters
                    movie_results = db.movie.find({"imdbID": {"$in": recomended_movie_ids}}, {'_id': 0, 'imdbID': 1, 'plot': 1, 'year': 1, 'poster': 1, 'actors': 1, 'genre': 1, 'director': 1, 'title': 1, 'imdbRating': 1}).limit(10) # Limiting to max 10 results

    			currentTime = pendulum.now() # Getting the time
    			timestamp = int(round(currentTime.timestamp())) # Converting to timestamp

                if (len(list(movie_results)) > 2):
                    # More than 2 movies retrieved
                    combined_movie_result_imdb_ids = []
                    combined_movie_results = []
                    for movie in movie_results:
                        # Adding timestamps & changing poster_url
                        # Not entirely neccessary - could cut this section if we change the 'poster_url' handling
                        #
                        combined_movie_result_imdb_ids.append(movie['imdbID'])
                        combined_movie_results.append({'imdbID': movie['imdbID'], # Store each movie's metadata record in a list
                                                   'k_mov_ts': timestamp, # We're adding this - it could be included once instead of every
                                                   'plot': movie['plot'],
                                                   'year': movie['year'],
                                                   'poster_url': movie['poster'], # change nodejs to skip this step
                                                   'actors': movie['actors'],
                                                   'genres': movie['genre'],
                                                   'director': movie['director'],
                                                   'title': movie['title'],
                                                   'imdbRating': movie['imdbRating']})

                    clicked_movie_IDs = [] # Intentionally blank!
                    voting_intention = [] # Intentionally blank!
                    ML_ID = "Google Cloud Model" # TODO: Rename automatically to latest model name somehow?
                    db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": recomended_movie_ids, "k_genre_movie_list":  "ML_ID": ML_ID, "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

                    return {'success': True,
                            'movies': combined_movie_results,
                            'input_parameters': {'QUERY_USER_ID': QUERY_USER_ID, 'QUERY_RATED_MOVIE_IDS': QUERY_RATED_MOVIE_IDS, 'QUERY_RATED_MOVIE_SCORES': QUERY_RATED_MOVIE_SCORES, 'QUERY_RATED_GENRE_IDS': QUERY_RATED_GENRE_IDS, 'QUERY_RATED_GENRE_FREQS': QUERY_RATED_GENRE_FREQS, 'QUERY_RATED_GENRE_AVG_SCORES': QUERY_RATED_GENRE_AVG_SCORES},
                            'recomended_movie_ids': recomended_movie_ids,
                            'genres': genres,
                            'error_message': '',
                            'valid_key': True,
                            'took': float(hug_timer)}
                else:
                    # Insufficient movie count
                    return {'success': False,
                            'error_message': 'too few movie results',
                            'valid_key': True,
                            'took': float(hug_timer)}

            else:
                # Below minimum vote requirement
                return {'success': False,
                        'error_message': 'less than 5 votes',
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
