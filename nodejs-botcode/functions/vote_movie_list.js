function recommendMovie(app) {
  /*
  Placeholder for the end 'recommend me' function!
  */
  app.data.fallbackCount = 0; // Iterator for tracking fallback loop attempt!

  const check_quantity_user_votes = {
    url: `${hug_host}/get_goat_movies`,
    method: 'GET', // GET request, not POST.
    json: true,
    headers: {
      'User-Agent': 'Vote Goat Bot',
      'Content-Type': 'application/json'
    },
    qs: { // form instead of qs - because this is a GET request
      gg_id: userId, // Anonymous google id
      api_key: 'API_KEY'
    }
  };

  requestLib(check_quantity_user_votes, (err, httpResponse, body) => {
    if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
      if (body.success === true && body.valid_key === true) {
        //console.log("Recommend movie function triggered");
        const options = {
          url: `${hug_host}/get_random_movie_list`, // SWITCH FOR MOVIE RECOMMENDATIONS!
          method: 'GET', // GET request, not POST.
          json: true,
          headers: {
            'User-Agent': 'Vote Goat Bot',
            'Content-Type': 'application/json'
          },
          qs: { // qs instead of form - because this is a GET request
            gg_id: userId, // Anonymous google id
            api_key: 'API_KEY'
          }
        };

        requestLib(options, (err, httpResponse, body) => {
          if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!

            const quantity_top_k = body.length; // NOT PROVEN! Get the quantity of movies in top-k results.

            if (quantity_top_k > 0) {

              let movie_list = []; // Where we'll store the list elements
              const parameters = {}; // Creating parameter placeholder

              for (var index = 0; index < quantity_top_k; index++) {
                /*
                Given the quantity of movies returned in the JSON (eventually top-k movies),
                produce the 'buildOptionItem' element and store it in the 'movie_list' list.
                */
                if (body[index].success === true && body[index].valid_key === true) {
                  const index_value = index.toString(); // Creating string representation of index for context data
                  parameters[index_value] = body[index]; // Inserting the 'get_random_movie_list' body contents into the context parameter.

                  const current_movieTitle = body[index].title;
                  const current_movieYear = body[index].year;
                  const current_posterURL = body[index].poster_url;
                  //console.log(`${index}, ${current_movieTitle}, ${current_movieYear}, ${current_moviePlot}, ${current_posterURL}`);

                  movie_list[index] = app.buildOptionItem(index_value, [`${current_movieTitle}`]) // Synonyms for the movie. We just use the movie title for now, we provide alternative language entries?
                    .setTitle(`${current_movieTitle}`) // Setting the list element's title //(${current_movieYear})
                    .setImage(`${current_posterURL}`, `${current_movieTitle}`); // Squishing the poster into a 40x40 image.
                } else {
                  console.log("ERROR: RecommendMe function => failure | invalid key!");
                  serious_error_encountered(app); // Abandon ship! Might be dangerous!
                }
              } // End of FOR loop!

              app.setContext('list_body', 1, parameters); // Setting the outbound context to include the JSON body parameter data!

              const carousel = app.buildCarousel(); // declaring the carousel separately so we can iteratively add items to it.
              for (var iterator = 0; iterator < quantity_top_k; iterator++) { // Iterating over the top k body results!
                if (iterator > 9) {
                  break; // Can't place more than 10 items in the carousel!
                } else {
                  carousel.addItems(movie_list[iterator]); // Adding carousel items iterarively!
                }
              }

              let RichResponse = app.buildRichResponse();

              if (hasScreen === true) {
                RichResponse.addSimpleResponse('Alright, here are a few movies which I think you will like!');
                RichResponse.addSuggestions(['🗳 Rank Movies', '🏆 Show Stats', '📑 Help', `🚪 Back`]);
              } else {
                /*
                Best practice (according to Google) for presenting list/carousel items to speaker-only users is to only provide the first 3 movies.
                We still hold the data for movies 0-9 in the background, but we only tell the user about the first 3.
                This can be changed at any time by adding lines w/ incremented '${body[x].title}' tags.
                */
                const textToSpeech = `<speak>` +
                  `Would you watch the following movies? <break time="0.25s" /> ` +
                  `${body[0].title}? <break time="0.35s" /> ` +
                  `${body[1].title}? <break time="0.35s" /> ` +
                  `${body[2].title}? <break time="0.35s" /> ` +
                  `</speak>`;

                const textToDisplay = `Would you watch the following movies? ` +
                                      `${body[0].title}? ` +
                                      `${body[1].title}? ` +
                                      `${body[2].title}? `;

                RichResponse.addSimpleResponse({
                  speech: textToSpeech,
                  displayText: textToDisplay
                });
              }

              app.setContext('recommend_movie_context', 1, {
                "placeholder": "placeholder",
                "repeatedRichResponse": RichResponse,
                "repeatedCarousel": carousel
              });

              app.askWithCarousel(RichResponse, carousel); // Displaying the carousel!

            } else { // END OF THE IF STATEMENT RE: success & valid_key
              // NO MOVIES WERE RETRIEVED!
              console.log("recommendMovie: No movies were returned! It's possible (but unlikely) that the API key wasn't provided!");
              serious_error_encountered(app); // Abaondon ship! Maybe dangerous?
            }
          } else {
            // SOMETHING WENT TERRIBLY WRONG!
            console.log("recommendMovie: An error (err/http) was encountered! Error: ${err}");
            serious_error_encountered(app); // Abandon ship!
          }
        }) // END of the GET request!
      } else {
        // Something wrong with the hug function..
        small_error_encountered(app); // ABANDON SHIP! Safely, now!
      }
    } else {
      // Something went wrong with the GET request!
      console.log("Welcome: ERROR! Something went wrong with the welcome GET request!");
      serious_error_encountered(app);
    }
  })

} // END of the recommendMovie function!
