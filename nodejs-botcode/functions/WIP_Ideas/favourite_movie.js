app.intent('favourite_movie', (conv, { movieId }) => {
  /*
    Given an IMDB movie ID, display the movie & register interest in the movie!
    TODO: Dump CSV of movieID:Movie_Titles for entity => enabling movieId input by user!
  */
  var parsed_movie_id;
  if (typeof movieId !== 'undefined' && (movieId.length > 0)) {
    // The user provided a valid movie
    parsed_movie_id = movieId.toString();
  } else {
    // The user didn't enter a valid movie
    parsed_movie_id = ' ';
  }

  if (parsed_movie_id !== ' ') {
    // The user provided a movie
    const qs_input = {
      //  HUG REST GET request parameters
      gg_id: userId, // Anonymous google id
      movie_id: parsed_movie_id, // Passing the movie ID acquired via context
      rating: 1, // The rating we're setting for the movie we just displayed to the user.
      mode: 'training',
      api_key: 'API_KEY'
    };

    return hug_request('HUG', 'submit_movie_rating', 'GET', qs_input)
    .then(body => {
      if (body.valid_key === true) {
        // Check for success, not just valid key?
        // TODO: How to follow up? Display mentioned movie contents? Ask why they like the movie? Ask for another movie?
        const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');


        // TODO: INSERT CODE HERE!


      } else {
        // This will only trigger if the API key changes.
        // Better than an unhandled crash!
        return catch_error(conv, 'Invalid Hug API KEY!', 'voting intent');
      }
    })
    .catch(error_message => {
      return catch_error(conv, error_message, 'favourite_movie');
    });
  } else {
    // The user didn't provide a movie
    // TODO: conv.ask simple response instructing the user to enter a valid movie title or Id
  }

});
