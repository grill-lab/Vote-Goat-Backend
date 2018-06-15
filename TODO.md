https://github.com/GoogleCloudPlatform/cloudml-samples/blob/master/movielens/trainer/task.py#L63

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

Outputs

----

Idea for coldstart recommendations:
1/3 Random
1/3 highest related
1/3 GOAT!

---

Work on logging!
* Chatbase key!
* Chatbase function calls
* HUG export to local CSV files (de-anonymized)

---

Import latest production Dialogflow ZIP into the staging 'Like Butter' Dialogflow project.
Publish to staging!
