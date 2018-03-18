# HUG.Rest MongoDB API!

# STEP 1: INSTALL!

sudo apt-get install python3-numpy python3-dev python3-pip python3-wheel nginx python3-venv

# Tensorflow installation

Installed within the same python virtual environment as HUG.

pip3 install --ignore-installed --upgrade "https://github.com/sigilioso/tensorflow-build/raw/master/tensorflow-1.4.0-cp36-cp36m-linux_x86_64.whl"

# Keras installation

pip3 install keras==1.2.2

## MISC NN installation requirements

pip3 install sklearn

pip3 install tqdm

pip3 install numpy

pip3 install scipy

pip3 install h5py

pip3 install pandas

# Server installation

mkdir python-virtual-environments

mkdir python-virtual-environments/HUG

COPY THE *.SH SCRIPTS TO ROOT! 'chmod +x' them & run 'source access_environment.sh'

python3 -m venv python-virtual-environments/HUG/

pip3 install pymongo

pip3 install hug

pip3 install gunicorn

pip3 install pendulum

Copy the nginx.conf file to /etc/nginx/

Reset nginx (sudo service nginx restart)

sudo cp hug.conf /etc/nginx/sites-available/hug.conf

sudo ln -s /etc/nginx/sites-available/hug.conf /etc/nginx/sites-enabled/nginx.conf

sudo rm -rf /etc/nginx/sites-available/default

sudo rm -rf /etc/nginx/sites-enabled/default

Add the 'ubuntu' user to the www-data group, otherwise we can't run gunicorn/hug properly.

# How to access the Python virtual environment

Log into HUG server as 'ubuntu' user.

Run the command 'source access_encironment.sh'

You're now in the python virtual environment.

# NEW METHOD: Running gunicorn as a systemD service

located: ```/etc/systemd/system/gunicorn.service```

```
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
sudo systemctl status gunicorn
```

Using ```/home/ubuntu/hug.socket``` for reverse proxy bridge, don't delete it.

If you make changes to the gunicorn service, execute the commands:
```
sudo systemctl daemon-reload
sudo systemctl restart gunicorn
```

If you want to install new python packages, first access the virtual environment:

```
source ./python-virtual-environments/HUG/bin/activate
```

# SSL SETUP!

We're using Ubuntu 17.10 BTW!

sudo add-apt-repository ppa:certbot/certbot

sudo apt-get update

sudo apt-get install python-certbot-nginx

NOTE: You need a domain name!

sudo certbot --nginx -d staging.domain.tld

sudo certbot --nginx -d prod.domain.tld

sudo certbot --nginx -d nn.domain.tld

# Example API requests

## API KEY!

Some basic security, can be intercepted though since we're not using SSL yet.

```
api_key=API_KEY
```

# Functions

create_user & submit_movie_rating can be reached by both get & post, all other functions solely use get.

It may be appropriate to remove 'GET' from create_user and submit_movie_rating in terms of security, however we've got the api_key in place.

You can't POST from the browser (like you easily can a GET), you need an application like [postman](https://www.getpostman.com/) (or a browser extension). POST is for nodejs pushing new data into mongodb rather than retreiving it.

NOTE: If you cannot connect, check if the IP you're using is the same static 'hug' ip address (currently: 35.197.207.94:4242). If server downtime is noticable, notify Ricky!

## create_user

Creates an user in the mongodb database.

https://prod.domain.tld/check_name?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&user_name=Richard%20Main&api_key=API_KEY

## check_name

The check_name function (same as permission function) is used to check if an user exists.

Same as the 'create_user' function without the 'insert_one' function (could remove to simplify).

https://staging.domain.tld/check_name?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

## submit_movie_rating

Submitting an user movie rating to mongodb.

https://staging.domain.tld/submit_movie_rating?gg_id=1ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&rating=1&api_key=API_KEY&movie_id=tt0000001&mode=training

## get_user_ratings

Retrieve a list of the user's rated movies, for use in the NN based recommendation system.

Input: User's anonymous google id. Output: List of movie ratings by user.

https://staging.domain.tld/get_user_ratings?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

## get_single_training_movie

Get a single movie for the training bot section.

Retrieves a list of movies the user has previously voted for, used as a filter!

https://staging.domain.tld/get_single_training_movie?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY&genres=%20&actors=%20

## log_clicked_item

Logs which carousel item the user clicked!

POST function, not a GET request.

## get_user_ranking

Returns the user's (most voted) leaderboard rating, as well as the quantity of users & the user's quantity of up/down votes.

GET request.

https://staging.domain.tld/get_user_ranking?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY


## get_random_movie_list

Input: user_id, Movie Genre, Language, Quantity (of results - 10 max)

Output: Ten random movies which meets the above criteria.

https://staging.domain.tld/get_random_movie_list?user_id=anon_google_id&genre=Action&language=English&limit=10&api_key=API_KEY

## get_nn_list

Input: gg_id, apikey

Output: Top-k list of personalized movie recommendations

https://nn.domain.tld/get_nn_list?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

## get_goat_movies

Input: genres, apikey

Output: Most upvoted movies within given genres.

https://staging.domain.tld/get_goat_movies?genres=Horror%20Comedy&api_key=API_KEY

## get_ab_value

Input: gg_id, apikey

Output: The AB value for switching between random movie recommendations & NN generated movie recommendations.

https://staging.domain.tld/get_ab_value?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

## log_clicked_item

Input: gg_id, movie_id, apikey

Output: Confirmation JSON (POST REQUEST)!

## get_user_code

Input: gg_id, apikey

Output: The ml_id

https://staging.domain.tld/get_user_code?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

-------

# UNUSED FUNCTIONS

NOTE! These unused functions are not live, thus their listed URLs will return 404/errors.

## get_more_movie_details

Input: User's gg_id
Output: Specified movie's extended data.

https://staging.domain.tld/get_more_movie_details?gg_id=ABwppHHfSXTh0E5W85lx9OirkAwBBvJJNW_5rqsuRPtC1C31s9GCW3Ql2ChP0WMiTb8BSIP1XSSj3shZnw&api_key=API_KEY

## get_movie_details_by_name

Input: Movie name
Output: Specified movie's data.

https://staging.domain.tld/get_movie_details_by_name?movie_name=Godzilla&api_key=API_KEY

## get_genre_movie

Input: user_id, Movie Genre, Language.
Output: Single random movie which meets the above criteria.
TODO: Filter out rated movies from the query

https://staging.domain.tld/get_genre_movie?user_id=anon_google_id&genre=Action&language=English&api_key=API_KEY

## get_actor_movies

Input: Actor name
Output: Movies with the input actor.

https://staging.domain.tld/get_actor_movies?actor=Bruce Willis&limit=10&api_key=API_KEY

## get_movies_like

Input: Movie name
Output: Movies like the input movie.

https://staging.domain.tld/get_movies_like?title=Die Hard&limit=10&api_key=API_KEY
