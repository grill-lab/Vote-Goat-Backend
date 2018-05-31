app.intent('getGoat', (conv, { movieGenre }) => {
  /*
  Displaying the most upvoted movies to the user in a simple/dumb manner.
  Can't produce tables, could create a list/carousel but that'd take more time than remaining.
  Can't produce many outbound links.
  */
  conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts! // For fallback handling

  const movie_genres_string = parse_parameter_list(movieGenre, ' '); // parse movieGenre dialogflow parameter input
  const movie_genres_comma_separated_string = parse_parameter_list(movieGenre, ', '); // parse movieGenre dialogflow parameter input

  const placeholder = {}; // The dict which will hold our parameter data
  placeholder['placeholder'] = 'placeholder'; // We need this placeholder
  app.setContext('home', 1, placeholder); // We need to insert data into the 'home' context for the home fallback to trigger! (Maybe not?..)

  const qs_input = {
    //  HUG REST GET request parameters
    genres: movie_genres_string, // Anonymous google id
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'get_goat_movies', 'GET', qs_input)
  .then(body => {
    if (body.length > 1) {
      if (body[0].success === true && body[0].valid_key === true) {
        // We've got movies to display!
        var movie_title_length_limit;
        var genre_title = ``;
        var goat_text = ``;
        var textToSpeech = ``;
        var goat_voice = ``;
        var textToSpeech = ``;
        var textToDisplay = ``;
        var quantity_results;

        if (hasScreen === true) {
          quantity_results = 10;
        } else {
          quantity_results = 3;
        }

        if (movieGenre.length > 0) {
          /*
          We need to account for the length of the genres in the SSML.
          Otherwise, validation will fail!
          body.length == quantity of movies returned in GOAT list!
          */
          movie_title_length_limit = Math.floor((640 - 72 - movie_genres_comma_separated_string.length)/body.length);
        } else {
          /*
          No genres input, increase the title length limit!
          */
          movie_title_length_limit = Math.floor((640 - 72)/body.length)
        }

        const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
        if (hasScreen === true) {
          // TODO: Make use of table cards to display this information once it's no longer in developer preview
          var sum_movie_title_lengths; // Var to hold summed length of movie titles
          for (var index = 0; index < body.length; index++) {
            /*
              Iterate over movies in GOAT list to check max length of movie titles
            */
            sum_movie_title_lengths += body[index].title;
          }

            for (var index = 0; index < body.length; index++) {
              // Iterate over movies in GOAT list
              let current_rank = index + 1; // Movie's ranking in GOAT list
              var movie_title; // Will populate with value in if statement

              if (sum_movie_title_lengths > movie_title_length_limit) {
                let temp_title = body[index].title; // Temporary var for holding title text
                movie_title = temp_title.substring(0, movie_title_length_limit); // Reducing the length of the movie title
              } else {
                movie_title = body[index].title; // non-limited movie title
              }

              if (index != (body.length - 1)) {
                goat_text += `${current_rank}: "${movie_title}" (${body[index].year}) \n`;
              } else {
                goat_text += `${current_rank}: "${movie_title}" (${body[index].year})`;
              }
              goat_voice += `${limited_title}<break time="0.3s" />`;
            }


          if (movie_genres_comma_separated_string.length > 2) {
            // The user provided genre parameters
            // >2 because no movie genres is ` `
            textToSpeech = `<speak>` +
                             `The greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                              goat_voice +
                           `</speak>`;
            speechToText = `The greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are: \n\n` +
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

          // The user has a screen, let's show them a card with some 'pro tips'
          let pro_tips = `These GOAT results are dynamically generated by our active userbase's movie rankings. ` +
                           `You can specify multiple genres to view different GOAT results ` +
                           `(E.g "greatest scary funny movies of all time)."` +
                           `Try looking for these movies on YouTube or the Google Play Movie store.`;
          conv.ask(
            new BasicCard({
              title: `🐐 GOAT (Greatest Of All Time) Movie Tips!`,
              text: pro_tips,/*
              buttons: new Button({
                title: `🍿 ?`,
                url: ``,
              }),
              image: {
                url: `${URL}`,
                accessibilityText: `${alt_text}`,
              },*/
              display: 'WHITE'
            })
          );

        } else {
          /*
            The user doesn't have a screen!
            Best practice is to only present 3 list results, not 10.
            We aught to provide some sort of paging to
          */
          const genre_title = movie_genres_parameter_data.join(', ')
          if (genre_title != ``) {
            textToSpeech = `<speak>The 3 greatest ${genre_title} movies of all time, as determined by our userbase are: <break time="0.35s" />`;
            textToDisplay = `The 3 greatest ${genre_title} movies of all time, as determined by our userbase are:`;
          } else {
            textToSpeech = `<speak>` +
              `The 3 greatest movies of all time, as determined by our userbase are: <break time="0.35s" />`;
            textToDisplay = `The 3 greatest movies of all time, as determined by our userbase are:`;
          }

          textToSpeech += `<say-as interpret-as="ordinal">1</say-as> place is ${body[0].title},<break time="0.1s" /> released in ${body[0].year}. <break time="0.35s" />` +
          `<say-as interpret-as="ordinal">2</say-as> place is ${body[1].title},<break time="0.1s" /> released in ${body[1].year}. <break time="0.35s" />` +
          `<say-as interpret-as="ordinal">3</say-as> place is ${body[2].title},<break time="0.1s" /> released in ${body[2].year}. <break time="0.35s" />` +
          `</speak>`;

          textToDisplay += `1st place is ${body[0].title}, released in ${body[0].year}.` +
          `2nd place is ${body[1].title}, released in ${body[1].year}.` +
          `3rd place is ${body[2].title}, released in ${body[2].year}.`;
        }

        conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          }),
          new SimpleResponse({
            speech: `<speak>What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help using Vote Goat<break time="0.175s" /> or quit? <break time="0.25s" /></speak> `,
            text: `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`
          })
        );

        if (hasScreen === true) {
          // The user has a screen, let's show them suggestion buttons.
          conv.ask(
            new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
          );
        }
      } else {
        // This should never trigger, but better safer than sorry!
        return catch_error(conv, 'Unexpected error!', 'GOAT');
      }
    } else if (body.success === false && body.valid_key === true) {
      /*
        We've not got movies to display!
        Perhaps this is because the user has entered too many movie genres?
      */
      var textToSpeech;
      var speechToText;

      if (movie_genres_parameter_data.length > 0) {
        textToSpeech = `<speak>` +
          `I'm sorry, Vote Goat was unable to find any movies with the genres ${movie_genres_comma_separated_string}. <break time="0.35s" /> ` +
          `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
          `</speak>`;
        textToDisplay = `I'm sorry, Vote Goat was unable to find any movies with the genres ${movie_genres_comma_separated_string}. \n\n\n\n ` +
                       `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`;
      } else {
        // This should never trigger.. there are earlier checks to prevent this...
        textToSpeech = `<speak>` +
          `I'm sorry, Vote Goat was unable to find any top movies. <break time="0.35s" /> ` +
          `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
          `</speak>`;
        textToDisplay = `I'm sorry, Vote Goat was unable to find any top movies. \n\n ` +
                       `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`;
      }

      conv.ask(
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      if (hasScreen === true) {
        // The user has a screen, let's show them suggestion buttons.
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
        );
      }

    } else {
      // An invalid api_key, shouldn't happen..
      return catch_error(conv, 'ERROR! Invalid HUG REST API key?', 'GOAT');
    }
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'progress_notification');
  });
}
