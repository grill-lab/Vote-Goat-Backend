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
base_folder = './ml-latest-small'
links = pandas.read_csv(base_folder +'/links.csv', engine='python', sep=',')
prepend_imdb_tag = 'tt' #Required prepended tag
prepended_imdbID = links['imdbId'].apply(lambda x: prepend_imdb_tag + str(int(x)).zfill(7))

links_dict = dict(zip(list(prepended_imdbID), list(links['movieId']))) # Used to convert imdbIDs to movieLens Ids
reverse_dict = dict(zip(list(links['movieId']), list(prepended_imdbID))) # Opposite of the links_dict to convert the movielens IDs back to imdbIDs!

#links_dict = pandas.read_csv(base_folder + '/links.csv', index_col=0, skiprows=1).to_dict()
#print(links_dict)
#print("loaded links dictionary")

"""
Create array user x movie
like: [0,1] ,unknown vote will be [0,0], dislike :[1,0]
"""
#n_movie = 165774

n_movie = int(len(nn_model.get_weights()[0])/3)
#print(n_movie)
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

gg_id = "ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw"
# API KEY VALID
user_id = get_user_id_by_gg_id(gg_id) # Get the user's movie rating user ID (incremental)

if user_id is not None:
	rating_training = db.user_ratings.find({'userId': user_id},{'_id':0})
	rating_training = pandas.DataFrame(list(rating_training))
	rating_training = rating_training[rating_training['imdbID'].isin(links_dict.keys())]
	rating_training["imdbID"].replace(links_dict, inplace=True)

	#print(rating_training)

	#print("b")

	if len(rating_training) > 0:
	    #print("Rating_Training > 0")
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
	    #print("y")
	    k = 10
	    movie_rating_prob[:,:,0][movie_rating_prob[:,:,0]==0] = 0.0000000000000001
	    sort_index = np.argsort(movie_rating_prob[:,:,1]/movie_rating_prob[:,:,0])
	    k_movie_id = sort_index[0,-10:][::-1]
	    #print("z")
	    #link movie id to imdb
	    k_imdb_id = list(map(reverse_dict.get, k_movie_id))
	    print(k_imdb_id)
	    #####################

	    #combined_json_list = []
	    #print("0")
	    #currentTime = pendulum.now() # Getting the time
	    #timestamp = int(round(currentTime.timestamp())) # Converting to timestamp

	    #for movie_id in k_imdb_id:
	    #    result = db.movie.find_one({"imdbID": movie_id}) # Retrieve movie given the imdb ID.

	    #    combined_json_list.append({'imdbID': result['imdbID'],
	    #                               'k_mov_ts': timestamp,
	    #                               'plot': result['plot'],
	    #                               'year': result['year'],
	    #                               'poster_url': result['poster'],
	    #                               'actors': result['actors'],
	    #                               'genres': result['genre'],
	    #                               'director': result['director'],
	    #                               'title': result['title'],
	    #                               'imdbRating': result['imdbRating'],
	    #                               'success': True,
	    #                               'valid_key': True,
	    #                               'took': float(hug_timer)})
	    #print("1")
	    #clicked_movie_IDs = [] # Intentionally blank!
	    #voting_intention = [] # Intentionally blank!
	    #NN_ID = newest_file # Change to proper NN_ID once not random!

	    #db.recommendation_history.insert_one({"userId": user_id, "k_movie_list": k_imdb_id, "NN_ID": NN_ID, "k_mov_timestamp": timestamp, "clicked_movie_IDs": clicked_movie_IDs, "voted": voting_intention})
	    #print("2")
	    #return combined_json_list
	else:
	    # API KEY INVALID!
	    print("ELSE!")
	    #return {'success': False, 'valid_key': False, 'took': float(hug_timer)}
else:
	# Invalid GG_ID!
	print("INVALID GG_ID!")
