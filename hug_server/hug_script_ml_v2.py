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
base_folder = './ml-latest-small'
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

@hug.get(examples='gg_id=anonymous_google_id&api_key=API_KEY')
def get_nn_list(gg_id: hug.types.text, api_key: hug.types.text, hug_timer=120):
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

            # TODO: The following line was used to limit our mongodb moviedb to only the movies present in the 'small' movielens dataset. Likely not needed anymore? Limit to the larger links CSV?
            #   rating_training = rating_training[rating_training['imdbID'].isin(links_dict.keys())] # Limiting the pandas array to movies present in the links.csv file

            #rating_training["imdbID"].replace(links_dict, inplace=True) # Replacing the imdbIDs (tt0000001) with movielens tmdb ids

            #prepare input of model
            vote = np.array(np.int_(rating_training.rating))
            movieId = np.int_(np.array(rating_training.imdbID))

            """
            TODO: @Jeff: Insert Google cloud ml request code.

            HUG INPUTS:

            # The user id.
            QUERY_USER_ID = 'query_user_id'
            # The ids of movies rated by the user.
            QUERY_RATED_MOVIE_IDS = 'query_rated_movie_ids'
            # The scores on the rated movies given by the user.
            QUERY_RATED_MOVIE_SCORES = 'query_rated_movie_scores'
            # The set of genres of the rated movies.
            QUERY_RATED_GENRE_IDS = 'query_rated_genre_ids'
            # The number of times the user rated each genre.
            QUERY_RATED_GENRE_FREQS = 'query_rated_genre_freqs'
            # The average rating on each genre.
            QUERY_RATED_GENRE_AVG_SCORES = 'query_rated_genre_avg_scores'

            Create a hug function to call the Google cloud ML, using the above input data!

            The above variables will require pymongo calls to the mongodb tables.

            create k movie list
            get top k movie id
            """
            k = 10
            k_movie_id = sort_index[0,-k:]
            k_imdb_id = list(map(reverse_dict.get, k_movie_id)) # Converting the top-k list movie IDs from movielens/tmdb back to imdbID

            combined_json_list = [] # Empty list where we'll store the top-k movie json items
            currentTime = pendulum.now() # Getting the time
            timestamp = int(round(currentTime.timestamp())) # Converting to timestamp, rounding it & converting to int

            for movie_id in k_imdb_id: # Loop over the top-k results
                result = db.movie.find_one({"imdbID": movie_id}) # Retrieve movie given the imdb ID from the top-k list

                combined_json_list.append({'imdbID': result['imdbID'],
                                           'k_mov_ts': timestamp,
                                           'plot': result['plot'],
                                           'year': result['year'],
                                           'poster_url': result['poster'],
                                           'actors': result['actors'],
                                           'genres': result['genre'],
                                           'director': result['director'],
                                           'title': result['title'],
                                           'imdbRating': result['imdbRating'],
                                           'success': True,
                                           'valid_key': True,
                                           'took': float(hug_timer)})

            clicked_movie_IDs = [] # Intentionally blank!
            voting_intention = [] # Intentionally blank!
            ML_ID = "Google Cloud Model"

            db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": k_imdb_id, "ML_ID": files[0], "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

            return combined_json_list
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
