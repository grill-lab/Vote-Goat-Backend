# Required for NN
from tqdm import tqdm
from sklearn import dummy, metrics, cross_validation, ensemble
from keras.models import load_model
import numpy as np
import pandas
import os
import zipfile
import requests
import keras.models as kmodels
import keras.layers as klayers
import keras.backend as K
import keras # Make sure to get the right version of keras installed!
import time

# Required for rest of hug scripts
from pymongo import *
from random import *
import pendulum
import hug

client = MongoClient("MONGODB_SEVER_DETAILS")
db = client.popcorndb

path = os.path.expanduser('~')+"/models"
files = os.listdir(path)
files.sort(reverse=True)
newest_file = path + "/" + files[0]
nn_model = load_model(newest_file)

#link imdbID to movielens
base_folder = './ml-latest-small' # We're currently using the small dataset (larger would be better, but would introduce other issues like memory allocation across workers)
links = pandas.read_csv(base_folder +'/links.csv', engine='python', sep=',') # Retrieving the 'links' csv file to match tmdb:imdb ids.
prepend_imdb_tag = 'tt' #Required prepended tag
prepended_imdbID = links['imdbId'].apply(lambda x: prepend_imdb_tag + str(int(x)).zfill(7)) # Creating the same imdbID format which are present in mongodb

links_dict = dict(zip(list(prepended_imdbID), list(links['movieId']))) # Used to convert imdbIDs to movieLens Ids
reverse_dict = dict(zip(list(links['movieId']), list(prepended_imdbID))) # Opposite of the links_dict to convert the movielens IDs back to imdbIDs!

"""
Create array user x movie
like: [0,1] ,unknown vote will be [0,0], dislike :[1,0]
"""
n_movie = int(len(nn_model.get_weights()[0])/3)
pregenerated_vote_list = np.zeros((1,n_movie,2))
pregenerated_connection_list = np.ones((1,n_movie,1))

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
            rating_training = pandas.DataFrame(list(rating_training)) # Transforming the rating json to a list then into a pandas array
            rating_training = rating_training[rating_training['imdbID'].isin(links_dict.keys())] # Limiting the pandas array to movies present in the links.csv file

            if len(rating_training) > 0: # After removing the non-present movies, check we've got more than 1 movie rating left!
                rating_training["imdbID"].replace(links_dict, inplace=True) # Replacing the imdbIDs (tt0000001) with movielens tmdb ids

                #prepare input of model
                vote = np.array(np.int_(rating_training.rating))
                movieId = np.int_(np.array(rating_training.imdbID))

                #set rating : like /dislike
                y = np.zeros((rating_training.shape[0], 2))
                y[np.arange(rating_training.shape[0]), vote] = 1

                connection_list = pregenerated_connection_list
                vote_list = pregenerated_vote_list
                vote_list[0,movieId] = y

                input_list = np.concatenate((connection_list,vote_list),axis=2)
                vote_list = np.int_(np.reshape(vote_list,(1,vote_list.shape[1]*vote_list.shape[2])))
                input_list = np.int_(np.reshape(input_list,(1,input_list.shape[1]*input_list.shape[2])))

                movie_rating_prob = nn_model.predict([input_list])
                movie_rating_prob = movie_rating_prob.reshape((1,n_movie,2))

                """
                create k movie list
                get top k movie id
                avoid dividing by zero
                """
                k = 10
                movie_rating_prob[:,:,0][movie_rating_prob[:,:,0]==0] = 0.0000000000000001
                sort_index = np.argsort(movie_rating_prob[:,:,1]/movie_rating_prob[:,:,0])
                k_movie_id = sort_index[0,-10:][::-1]
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
                NN_ID = newest_file # Change to proper NN_ID once not random!

                db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": k_imdb_id, "NN_ID": files[0], "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})

                return combined_json_list
            else:
                """
                After removing non-links.csv movie ratings, no ratings were left.
                We'll present the user with an apology prompt via nodejs.
                """
                return {'success': False,
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
