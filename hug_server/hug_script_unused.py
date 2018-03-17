@hug.get(examples='movie_name=Gozdilla&api_key=API_KEY')
def get_movie_details_by_name(movie_name: hug.types.text, api_key: hug.types.text, hug_timer=5):
	"""
	Input: Movie name
	Output: Specified movie's data.
	TODO:
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		results = db.movie.find({"title": movie_name})
		combined_json_list = []

		for result in results:
			combined_json_list.append({'plot': result['plot'], 'year': result['year'], 'poster_url': result['poster'], 'actors': result['actors'], 'director': result['director'], 'title': result['title'], 'took': float(hug_timer)})

		if (len(combined_json_list) > 0):
			return combined_json_list
		else:
			return {'success': False, 'valid key': True, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		return {'success': False, 'valid key': False, 'took': float(hug_timer)}

@hug.get(examples='user_id=ABwppHH7BVJqkhcofabGdU22nrlY9zlgWaFDgvzc9hHNrPdhqM823RSYy1KcPiuNagqIzXcov-FL0_KgA5n8FYQ&genre=Action&language=English&api_key=API_KEY')
def get_genre_movie(user_id: hug.types.text, genre: hug.types.text, language: hug.types.text, api_key: hug.types.text, hug_timer=5):
	"""
	Input: user_id, Movie Genre, Language.
	Output: Single random movie which meets the above criteria.
	TODO: Filter out rated movies from the q
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		result_count = db.movie.find({"genre": genre, "language": language}).count() # Finding all movies which match this genre
		result = db.movie.find({"genre": genre, "language": language}).limit( 1 ).skip(randrange(1, result_count))[0]
		return {'actors': result['actors'], 'director': result['director'], 'plot': result['plot'], 'poster_url': result['poster'], 'runtime': result['runtime'], 'title': result['title'], 'year': result['year'], 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		return {'valid key': False, 'took': float(hug_timer)}

@hug.get(examples='actor=Bruce Willis&limit=10&api_key=API_KEY')
def get_actor_movies(actor: hug.types.text, limit: hug.types.number, api_key: hug.types.text, hug_timer=5):
	"""
	Input: Actor name
	Output: Movies with the input actor.
	TODO: Random order if quantity < count?
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		#result_count = db.movie.find({"actors": genre}).count() # Finding all movies which match this genre
		results = db.movie.find({"actors": actor}).limit(limit) # Finding all movies which match this genre

		combined_json_list = []

		for result in results:
			combined_json_list.append({ 'plot': result['plot'], 'poster_url': result['poster'], 'title': result['title'], 'result': True, 'took': float(hug_timer)})

		if (len(combined_json_list) > 0):
			return combined_json_listl
		else:
			return {'result': False, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		return {'valid key': False, 'took': float(hug_timer)}

@hug.get(examples='title=Die Hard&limit=10&api_key=API_KEY')
def get_movies_like(title: hug.types.text, limit: hug.types.number, api_key: hug.types.text, hug_timer=5):
	"""
	Input: Movie name
	Output: Movies like the input movie.
	TODO: If many movies with input name, select best fit for recommendation?
	"""
	if (check_api_token(api_key) == True):
		# API KEY VALID
		results = db.movie.find({"title": title}).limit(limit)
		actors = []
		genres = []
		#age_rating = []
		#languages = []

		for result in results:
			actors.extend(result['actors'])
			genres.extend(result['genre'])
			#age_rating.extend(result['rate_desc'])

		actor_search = list(set(actors))
		genre_search = list(set(genres))
		#age_search = list(set(age_rating))

		#if ('U' in age_search):
		#	max_age_rating = ['U', 'G', ]

		# Detect 'Minimum' age rating in list of retrieved movies, set mandatory (must match at least one in list) age rating to that value (across the many rating boards)

		# https://www.alrc.gov.au/publications/appendix-3-international-comparison-classification-and-content-regulation/table-interna
		# https://en.wikipedia.org/wiki/Motion_picture_content_rating_system

		#second_search = db.movie.find({'actors': {'$in': actor_search}, 'genre': {'$in': genre_search}, 'rate_desc': {'$in': age_search}}).limit(limit)
		second_search = db.movie.find({'actors': {'$in': actor_search}, 'genre': {'$in': genre_search}}).limit(limit)

		combined_json_list = []
		for item in second_search:
			#print("result: {}".format(result['title']))
			combined_json_list.append({'plot': item['plot'], 'poster_url': item['poster'], 'title': item['title'], 'year': item['year'], 'result': True, 'took': float(hug_timer)})

		if (len(combined_json_list) > 0):
			return combined_json_list
		else:
			return {'result': False, 'took': float(hug_timer)}
	else:
		# API KEY INVALID!
		return {'valid key': False, 'took': float(hug_timer)}
