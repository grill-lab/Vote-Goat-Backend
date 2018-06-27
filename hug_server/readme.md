# Vote Goat HUG API

## About

This HUG REST API is for providing the Vote Goat Google Assistant python compute capacity and fast access to mongodb to store user data and read movie information.

By following the readme, you can easily recreate the API in your own control. Do remember to change the API key.

## How to contribute

It's difficult to debug development issues whilst running behind Gunicorn & NGINX, you're best running the HUG REST API directly with HUG during development "hug -f bts_api.py". Note that running HUG directly in this manner should only be performed during development, it is not suitable for exposing directly to the public as a production ready API.

### About: HUG

> ##### Embrace the APIs of the future
> Drastically simplify API development over multiple interfaces. With hug, design and develop your API once, then expose it however your clients need to consume it. Be it locally, over HTTP, or through the command line - hug is the fastest and most modern way to create APIs on Python3.
> ##### Unparalleled performance
> hug has been built from the ground up with performance in mind. It is built to consume resources only when necessary and is then compiled with Cython to achieve amazing performance. As a result, hug consistently benchmarks as one of the fastest Python frameworks and without question takes the crown as the fastest high-level framework for Python 3.
>
> Source: [Official website](http://www.hug.rest/).

### About: Extensibility

If your HUG functions takes a long time to compute, then you must account for NGINX & Gunicorn worker timeouts (both the systemctl service file & the 'default' NGINX sites-available file). If you fail to account for this, the user will experience unhandled timeouts.

Since HUG utilizes Python, any Python library can be used to process movie/user data.

---

## Install guide

This is an install guide for Ubuntu 17.10. The HUG REST API uses Python3, HUG, Gunicorn & NGINX. If you change the OS or server components then the following guide will be less applicable, if you succeed please do provide a separate readme for alternative implementation solutions.

### Setup dependencies & Python environment

We create the 'hugapi' user, however you could rename this to whatever you want, just remember to change the NGINX & Gunicorn configuration files.

#### Setup a dedicated user

```
adduser hugapi
<ENTER NEW PASSWORD>
<CONFIRM NEW PASSWORD>
usermod -aG sudo hugapi
sudo usermod -a -G www-data hugapi
su - hugapi
```

## Setup dependencies

```
sudo apt-get install python3-numpy python3-dev python3-pip python3-wheel nginx python3-venv
```

## Setup Python environment

### Create Python virtual environment

```
mkdir HUG
virtualenv -p python3 HUG
echo "source ./HUG/bin/activate" > access_env.sh
chmod +x access_env.sh
source access_env.sh
```

### Install Python packages

```
pip3 install pymongo
pip3 install hug
pip3 install gunicorn
pip3 install pendulum
pip3 install numpy
pip3 install pandas
pip3 install requests
```

## Configure nginx

### nginx configuration

```
sudo mv nginx.conf /etc/nginx/nginx.conf
sudo service nginx restart
sudo mv default /etc/nginx/sites-available/default
sudo service nginx restart
```

### Whitelist Google IP addresses

Perform the following terminal commands (windows example):

```
nslookup -q=TXT _cloud-netblocks1.googleusercontent.com 8.8.8.8
nslookup -q=TXT _cloud-netblocks2.googleusercontent.com 8.8.8.8
nslookup -q=TXT _cloud-netblocks3.googleusercontent.com 8.8.8.8
nslookup -q=TXT _cloud-netblocks4.googleusercontent.com 8.8.8.8
nslookup -q=TXT _cloud-netblocks5.googleusercontent.com 8.8.8.8
nslookup -q=TXT _cloud-netblocks6.googleusercontent.com 8.8.8.8
```

You'll get a list of IP addresses, we want to whitelist them and block the rest in our nginx configuration:

```
allow ip.ip.ip.ip/port
allow ip.ip.ip.ip/port
....
allow ip.ip.ip.ip/port
allow ip.ip.ip.ip/port
deny all
```

### Implement SSL Cert

You aught to implement a free [LetsEncrypt SSL certificate](https://certbot.eff.org/), this requires a domain name (they don't sign IP addresses) and it needs to be renewed every few months by running certbot again.

    sudo add-apt-repository ppa:certbot/certbot
    sudo apt-get update
    sudo apt-get install python-certbot-nginx
    sudo certbot --nginx -d api.domain.tld

### Configure Gunicorn

Official website: http://gunicorn.org/

Documentation: http://docs.gunicorn.org/en/stable/

Gunicorn is used to provide scalable worker process management and task buffering for the HUG REST API. Gunicorn's documentation states that each CPU can provide roughly 2-3+ Gunicorn workers, however it may be able to achieve a higher quantity (worth testing).

    cp gunicorn.service /etc/systemd/system/gunicorn.service
    sudo systemctl start gunicorn
    sudo systemctl enable gunicorn

### MISC

If you make changes to the service or the hug script:

    sudo systemctl daemon-reload
    sudo systemctl restart gunicorn

If you want to monitor Gunicorn:

    tail -f gunicorn_access_log
    tail -f gunicorn_error_log
    sudo systemctl status gunicorn

---

# Available HUG REST API functionality

This section will detail the functionality which will be available to the public through GET requests.

## create_user

Creates an user in the mongodb database.

## submit_movie_rating

Submitting an user movie rating to mongodb.

## get_user_ratings

Retrieve a list of the user's rated movies, for use in the NN based recommendation system.

Input: User's anonymous google id. Output: List of movie ratings by user.

## get_user_code

Returns the user's rating 'userId' (number not string)

## get_single_training_movie

Get a single movie for the training bot section.

Retrieves a list of movies the user has previously voted for, used as a filter!

## log_clicked_item

Logs which carousel item the user clicked!

POST function, not a GET request.

## get_user_ranking

Returns the user's (most voted) leaderboard rating, as well as the quantity of users & the user's quantity of up/down votes.

GET request.

## get_random_movie_list

Input: user_id, Movie Genre, Language, Quantity (of results - 10 max)

Output: Ten random movies which meets the above criteria.

## get_goat_movies

Input: genres, apikey

Output: Most upvoted movies within given genres.

## get_ab_value

Input: gg_id, apikey

Output: The AB value for switching between random movie recommendations & NN generated movie recommendations.

## log_clicked_item

Input: gg_id, movie_id, apikey

Output: Confirmation JSON (POST REQUEST)!
