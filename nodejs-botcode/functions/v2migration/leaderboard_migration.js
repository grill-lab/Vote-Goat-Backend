function getGoat(app) {
  /*
  Displaying the most upvoted movies to the user in a simple/dumb manner.
  Can't produce tables, could create a list/carousel but that'd take more time than remaining.
  Can't produce many outbound links.
  */
  app.data.fallbackCount = 0; // Required for tracking fallback attempts! // For fallback handling

  var movie_genres_string; // Initializing the var for later in getGoat
  var movie_genres_parameter_data; // Workaround to get parameter values of 'list type'

  if (req.body.result.parameters['movieGenre']) {
    /*
    We will attempt to retrieve the movie genres.
    If no movie genres are detected, we output a blank character.
    */
    //console.log("User ran the goat function & the movieGenre parameter was read!");

    movie_genres_parameter_data = req.body.result.parameters['movieGenre']; // Workaround to get parameter values of 'list type'

    if (Array.isArray(movie_genres_parameter_data)) {
      // Verifying that the parameter data (which is a list) is stored in an array (workaround)
      const quantity_genres = movie_genres_parameter_data.length;

      if (quantity_genres > 0) {
        // Genres are actually present in the user's input
        movie_genres_string = movie_genres_parameter_data.join(' '); // Merge into a string for GET request
      } else {
        // User didn't provide any genres
        movie_genres_string = ' ';
      }
    } else {
      // Our workaround no longer works
      small_error_encountered(app);
    }
  }

  const placeholder = {}; // The dict which will hold our parameter data
  placeholder['placeholder'] = 'placeholder'; // We need this placeholder
  app.setContext('home', 1, placeholder); // We need to insert data into the 'home' context for the home fallback to trigger! (Maybe not?..)

  const options = {
    url: `${hug_host}/get_goat_movies`,
    method: 'GET', // GET request
    json: true,
    headers: {
      'User-Agent': 'Vote Goat Bot',
      'Content-Type': 'application/json'
    },
    qs: { // form instead of qs - because this is a GET request
      genres: movie_genres_string, // Genres the user input
      api_key: 'API_KEY'
    }
  };

  requestLib(options, (err, httpResponse, body) => {
    if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
      if (body.length > 1) {
        if (body[0].success === true && body[0].valid_key === true) {
          // We've got movies to display!

          let goatCard = app.buildRichResponse();

          var movie_title_length_limit;
          var genre_title = ``;
          var goat_text = ``;
          var textToSpeech = ``;
          var goat_voice = ``;
          var textToSpeech = ``;
          var speechToText = ``;
          var quantity_results;

          if (hasScreen === true) {
            quantity_results = 10;
          } else {
            quantity_results = 3;
          }

          if (movie_genres_parameter_data.length > 0) {
            /*
            We need to account for the length of the genres in the SSML.
            Otherwise, validation will fail!
            */
            genre_title = movie_genres_parameter_data.join(', ')
            const genre_length = genre_title.length
            movie_title_length_limit = Math.floor((640 - 72 - genre_length)/body.length)
          } else {
            /*
            No genres input, increase the title length limit!
            */
            movie_title_length_limit = Math.floor((640 - 72)/body.length)
          }


          if (hasScreen === true) {
            for (var index = 0; index < body.length; index++) {
              let current_rank = index + 1;
              let temp_title = body[index].title;
              let limited_title = temp_title.substring(0, movie_title_length_limit);
              if (index != (body.length - 1)) {
                goat_text += `${current_rank}: "${limited_title}" (${body[index].year}) \n`;
              } else {
                goat_text += `${current_rank}: "${limited_title}" (${body[index].year})`;
              }
              goat_voice += `${limited_title}<break time="0.3s" />`;
            }

            if (genre_title != ``) { //&& genre_title != undefined
              // The user provided genre parameters
              textToSpeech = `<speak>` +
                               `The greatest ${genre_title} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                goat_voice +
                             `</speak>`;
              speechToText = `The greatest ${genre_title} movies of all time, as determined by our userbase are: \n\n` +
                                goat_text;
            } else {
              // The user didn't provide genre parameters
              textToSpeech = `<speak>` +
                               `The greatest movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                goat_voice +
                             `</speak>`;
              speechToText = `The greatest movies of all time, as determined by our userbase are: \n\n` +
                                goat_text;
            }

            let pro_tips = `These GOAT results are dynamically generated by our active userbase's movie rankings. ` +
                             `You can specify multiple genres to view different GOAT results ` +
                             `(E.g "greatest scary funny movies of all time)."` +
                             `Try looking for these movies on YouTube or the Google Play Movie store.`;
            goatCard.addBasicCard(
              app.buildBasicCard(pro_tips)
              .setTitle(`🐐 GOAT (Greatest Of All Time) Movie Tips!`)
            );
          } else {
            const genre_title = movie_genres_parameter_data.join(', ')
            if (genre_title != ``) {
              textToSpeech = `<speak>` +
                `The greatest ${genre_title} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                `<say-as interpret-as="ordinal">1</say-as> place is ${body[0].title},<break time="0.1s" /> released in ${body[0].year}. <break time="0.35s" />` +
                `<say-as interpret-as="ordinal">2</say-as> place is ${body[1].title},<break time="0.1s" /> released in ${body[1].year}. <break time="0.35s" />` +
                `<say-as interpret-as="ordinal">3</say-as> place is ${body[2].title},<break time="0.1s" /> released in ${body[2].year}. <break time="0.35s" />` +
                `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
                `</speak>`;
              speechToText = `The greatest ${genre_title} movies of all time, as determined by our userbase are: \n\n` +
                `1st place is ${body[0].title}, released in ${body[0].year}. \n\n` +
                `2nd place is ${body[1].title}, released in ${body[1].year}. \n\n` +
                `3rd place is ${body[2].title}, released in ${body[2].year}. \n\n`;
            } else {
              textToSpeech = `<speak>` +
                `The greatest movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                `<say-as interpret-as="ordinal">1</say-as> place is ${body[0].title},<break time="0.1s" /> released in ${body[0].year}. <break time="0.35s" />` +
                `<say-as interpret-as="ordinal">2</say-as> place is ${body[1].title},<break time="0.1s" /> released in ${body[1].year}. <break time="0.35s" />` +
                `<say-as interpret-as="ordinal">3</say-as> place is ${body[2].title},<break time="0.1s" /> released in ${body[2].year}. <break time="0.35s" />` +
                `</speak>`;
              speechToText = `The greatest movies of all time, as determined by our userbase are: \n\n` +
                `1st place is ${body[0].title}, released in ${body[0].year}. \n\n` +
                `2nd place is ${body[1].title}, released in ${body[1].year}. \n\n` +
                `3rd place is ${body[2].title}, released in ${body[2].year}. \n\n`;
            }
          }

          goatCard.addSimpleResponse({
            // Applicable to both screen & display users
            speech: textToSpeech,
            displayText: speechToText
          });

          goatCard.addSimpleResponse({
            speech: `<speak>What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help using Vote Goat<break time="0.175s" /> or quit? <break time="0.25s" /></speak> `,
            displayText: `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`
          });

          goatCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`]);

          app.ask(goatCard); // Sending the details to the user, awaiting input!

        } else {
          // This should never trigger, but better safer than sorry!
          small_error_encountered(app);
        }
      } else if (body.success === false && body.valid_key === true) {
        // We've not got movies to display!
        var textToSpeech;
        var speechToText;
        let goatCard = app.buildRichResponse();

        if (movie_genres_parameter_data.length > 0) {

          let genre_array = movie_genres_parameter_data; // NOT CONST! Because we want to potentially edit the last element to 'and genre'
          if (Array.isArray(genre_array)) {
            const quantity_genres = genre_array.length; // Quantity of genres in the genre array
            if (quantity_genres > 1) { // More than one genre? Engage!
              genre_array[quantity_genres - 1] = 'and ' + genre_array[quantity_genres - 1]; // We're setting the last actor array element to 'and <actor>'
            }
          }
          const genre_list = (genre_array.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

          textToSpeech = `<speak>` +
            `I'm sorry, Vote Goat was unable to find any movies with the genres ${genre_list}. <break time="0.35s" /> ` +
            `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
            `</speak>`;
          speechToText = `I'm sorry, Vote Goat was unable to find any movies with the genres ${genre_list}. \n\n\n\n ` +
                         `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`;
        } else {
          // This should never trigger.. there are earlier checks to prevent this...
          textToSpeech = `<speak>` +
            `I'm sorry, Vote Goat was unable to find any top movies. <break time="0.35s" /> ` +
            `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
            `</speak>`;
          speechToText = `I'm sorry, Vote Goat was unable to find any top movies. \n\n ` +
                         `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`;
        }

        if (hasScreen === true) {
          goatCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`]);
        }

        goatCard.addSimpleResponse({
          speech: textToSpeech,
          displayText: speechToText
        });
        app.ask(goatCard); // Sending the details to the user, awaiting input!

      } else {
        // An invalid api_key, shouldn't happen..
        small_error_encountered(app);
      }
    } else {
      // Request has gone wrong
      serious_error_encountered(app);
    }
  })

}
