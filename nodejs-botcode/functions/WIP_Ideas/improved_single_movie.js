function get_single_unrated_movie(conv, movieGenre) {
  /*
    This function retrieves a single movie from MongoDB via the HUG REST server.
    You can specify the sorting target & direction, as well as the input genres (space separated string)
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  return setup_experiment (conv, 'get_single_unrated_movie', movieGenre)
    .then(experiment_body => {
      /*
      Example body:
      {
      'experiment_id': body['experiment_id'],
      'target_hug_parameters': target_hug_parameters,
      'target_hug_function': body.target_hug_function["1"],
      'outcome': 1
      };
      */
      return Promise.all(
        [
          hug_request('HUG', experiment_body.target_hug_function, 'GET', experiment_body.target_hug_parameters)
        ]
      );
    })
    .then(body => {
      /*
      Example 'Horror' movie body:
      {
        "movie_result": {
          "title": "The Shining",
          "plot": "Signing a contract, Jack Torrance, a normal writer and former teacher agrees to take care of a hotel which has a long, violent past that puts everyone in the hotel in a nervous situation. While Jack slowly gets more violent and angry of his life, his son, Danny, tries to use a special talent, the \"Shining\", to inform the people outside about whatever that is going on in the hotel.",
          "type": "movie",
          "genre": [
            "Drama",
            "Horror"
          ],
          "rate_desc": "R",
          "year": 1980,
          "runtime": "146 min",
          "poster": "POSTER_URL",
          "language": [
            "English"
          ],
          "country": [
            "UK",
            "USA"
          ],
          "production": "N/A",
          "website": "about:blank",
          "director": [
            "Stanley Kubrick"
          ],
          "writer": [
            "Stephen King (novel)",
            "Stanley Kubrick (screenplay)",
            "Diane Johnson (screenplay)"
          ],
          "actors": [
            "Jack Nicholson",
            "Shelley Duvall",
            "Danny Lloyd",
            "Scatman Crothers"
          ],
          "released": "13 Jun 1980",
          "awards": "N/A",
          "boxoffice": "N/A",
          "imdbID": "tt0081505",
          "imdbRating": 8.4,
          "imdbVotes": 724275,
          "metascore": 63,
          "ratings": [
            {
              "Source": "Internet Movie Database",
              "Value": "8.4/10"
            },
            {
              "Source": "Rotten Tomatoes",
              "Value": "86%"
            },
            {
              "Source": "Metacritic",
              "Value": "63/100"
            }
          ],
          "goat_upvotes": 4,
          "goat_downvotes": 5,
          "total_goat_votes": 9,
          "sigir_upvotes": 0,
          "sigir_downvotes": 0,
          "total_sigir_votes": 0
        },
        "remaining": 14781,
        "success": true,
        "valid_key": true,
        "took": 0.44299908399989363
      }
      */
      if (body.valid_key === true) {
        let suggestions;
        if (body.success === true) {
          /*
            Triggers if a movie was found.
            Retrieving data from the 'get_single_training_movie' JSON request result
          */
          const plot = (body.movie_result.plot).replace('&', 'and');
          const year = body.movie_result.year;
          const posterURL = (body.movie_result.poster).replace("http://", "https://");
          const movieTitle = (body.movie_result.title).replace('&', 'and');
          const rate_desc = body.movie_result.rate_desc;
          const imdbRating = body.movie_result.imdbRating;
          const movieID = body.movie_result.imdbID;
          const genre_list = helpExtract(body.movie_result.genre);
          const actor_list = helpExtract(body.movie_result.actors);
          const director_list = helpExtract(body.movie_result.director);

          const fallback_messages = [
            `Sorry, what was that?`,
            `Sorry, I didn't catch that, would you watch ${movieTitle}?`,
            `I'm sorry, I didn't understand that. Would you cosider watching ${movieTitle}?`
          ];

          suggestions = [`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, `🤔 recommend me a movie`, '🏆 Show Stats', `🐐 GOAT Movies`, `🚪 Quit`];

          const ranking_text = [
            `Would you watch "${movieTitle}"?`,
            `Do you like "${movieTitle}"?`,
            `Is "${movieTitle}" worth watching?`,
            `What about "${movieTitle}"? Any good?`,
            `How about "${movieTitle}"? Would you watch it?`,
            `Considered watching "${movieTitle}?"`,
            `What do you think of "${movieTitle}"?`
          ];

          const chosen_ranking_text = ranking_text[Math.floor(Math.random() * ranking_text.length)];
          const textToSpeech =  `<speak>${chosen_ranking_text}</speak>`;
          const textToDisplay = chosen_ranking_text;

          return Promise.all(
            [
              store_fallback_response(conv, fallback_messages, suggestions),
              store_movie_data(conv, 'training', movieID, movieTitle, plot, year, imdbRating, genre_list, actor_list, director_list),
              store_repeat_response(conv, 'Training', textToSpeech, textToDisplay),
              {"suggestions":suggestions, "movieID":movieID, "movieTitle":movieTitle, "plot":plot, "year":year, "posterURL":posterURL, "imdbRating":imdbRating, "genre_list":genre_list, "rate_desc":rate_desc, "actor_list":actor_list, "director_list":director_list}
            ]
          );
        } else {
          const fallback_messages = [
            "Sorry, Vote Goat couldn't find any movies matching that query. What do you want to do next?",
            "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?"
          ];

          suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation',  '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

          store_fallback_response(conv, fallback_messages, suggestions);

          chatbase_analytics(
            conv,
            "Couldn't find a movie for user to vote on!", // input_message
            'get_single_unrated_movie', // input_intent
            'Fail' // win_or_fail
          );

          return genericFallback(conv, `get_single_unrated_movie`);
        } // End of else
      } else {
      /*
        Invalid HUG REST API KEY
      */
      return catch_error(conv, 'Invalid Hug API KEY!', 'get_single_unrated_movie');
      }
    );
    .then(final_results => {
      const movie_metadata = final_results;
      chatbase_analytics(
        conv,
        `Showed user ${movieTitle} (${movieID})`, // input_message
        'get_single_unrated_movie', // input_intent
        'Win' // win_or_fail
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        // The user has a screen, let's show them a card & suggestion buttons.
        conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          }),
          new BasicCard({
            title: `${movie_metadata['movieTitle']} (${movie_metadata['year']})`,
            subtitle: `IMDB Id: ${movie_metadata['movieID']}`,
            text: `IMDB Rating: ${movie_metadata['imdbRating']}  Genres: ${movie_metadata['genre_list']}  Age rating: ${movie_metadata['rate_desc']}`,
            buttons: new Button({
              title: `🍿 Watch "${movie_metadata['movieTitle']}"`,
              url: `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://play.google.com/store/search?q=${movie_metadata['movieTitle']}&c=movies`,
            }),
            image: { // Mostly, you can provide just the raw API objects
              url: `${movie_metadata['posterURL']}`,
              accessibilityText: `${movie_metadata['movieTitle']}`
            },
            display: 'WHITE'
          }),
          new Suggestions(suggestions)
        );
      } else {
        conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          })
        );
      }
    });
    .catch(error_message => {
      return catch_error(conv, error_message, 'get_single_unrated_movie');
    });
  }) // END of the GET request!
  .catch(error_message => {
    return catch_error(conv, error_message, 'get_single_unrated_movie');
  });
}
