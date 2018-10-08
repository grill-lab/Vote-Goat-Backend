function process_goat_speech (body, mgcss, movieGenre) {
  /*
    Displaying the most upvoted movies to the user.
  */
  return new Promise((resolve, reject) => {
    // Verifying that we've actually got movies to display
    let movie_title_length_limit;
    let sum_movie_title_lengths; // let to hold summed length of movie titles
    let goat_text = ``;
    let textToSpeech = ``;
    let textToDisplay = ``;
    let goat_voice = ``;

    // There's a screen!
    if (movieGenre.length > 0) {
      /*
      We need to account for the length of the genres in the SSML.
      Otherwise, validation will fail!
      body.length === quantity of movies returned in GOAT list!
      */
      movie_title_length_limit = Math.floor((640 - 72 - mgcss.length)/body.goat_movies.length);
    } else {
      /*
      No genres input, increase the title length limit!
      */
      movie_title_length_limit = Math.floor((640 - 72)/body.goat_movies.length)
    }

    for (let index = 0; index < body.goat_movies.length; index++) {
      /*
        Iterate over movies in GOAT list to check max length of movie titles
      */
      sum_movie_title_lengths += body.goat_movies[index].title;
    }

    for (let index = 0; index < body.goat_movies.length; index++) {
      // Iterate over movies in GOAT list
      let current_rank = index + 1; // Movie's ranking in GOAT list
      let movie_title = ``; // Will populate with value in if statement

      if (sum_movie_title_lengths > movie_title_length_limit) {
        let temp_title = body.goat_movies[index].title; // Temporary let for holding title text
        movie_title = temp_title.substring(0, movie_title_length_limit); // Reducing the length of the movie title
      } else {
        movie_title = body.goat_movies[index].title; // non-limited movie title
      }

      if (index !== (body.goat_movies.length - 1)) {
        goat_text += `${current_rank}: "${movie_title}" (${body.goat_movies[index].year}) \n`;
      } else {
        goat_text += `${current_rank}: "${movie_title}" (${body.goat_movies[index].year})`;
      }
      if (index === (body.goat_movies.length - 1)){
        goat_voice += `and ${movie_title}, <break time="0.3s" />`;
      } else {
        goat_voice += `${movie_title}, <break time="0.3s" />`;
      }
    }

    if (mgcss.length > 2 && mgcss !== "NONE") {
      // The user provided genre parameters
      // >2 because no movie genres is ` `
      textToSpeech = `<speak>` +
                       `The greatest ${mgcss} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                        goat_voice +
                     `</speak>`;
      textToDisplay = `The 'greatest ${mgcss} movies of all time', as determined by our userbase are:\n\n${goat_text}`;
    } else {
      // The user didn't provide genre parameters
      textToSpeech = `<speak>` +
                       `The greatest movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                        goat_voice +
                     `</speak>`;
      textToDisplay = `The 'greatest movies of all time', as determined by our userbase are:\n\n${goat_text}`;
    }

    if ((textToSpeech !== ``) && (textToDisplay !== ``) {
      // We've created a response
      return resolve({'textToSpeech':textToSpeech, 'textToDisplay':textToDisplay})
    } else {
      // Error!
      return reject(new Error('process_goat_speech failure!'));
    }
  });
}

app.intent('goat', (conv, { movieGenre }) => {
  /*
  Displaying the most upvoted movies to the user.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

  Promise.all([
    parse_parameter_list(movieGenre, ','),
    parse_parameter_list(movieGenre, ', verbose')
  ])
  .then(results => {
    // We've parsed the user input - let's perform a hug get request!
    const movie_genres_string = results[0];
    const movie_genres_comma_separated_string = results[1];

    conv.user.storage.movieGenre = movie_genres_string;

    return Promise.all([
      movie_genres_string,
      movie_genres_comma_separated_string,
      hug_request(
        'HUG',
        'get_goat_movies',
        'GET',
        {
          genres: movie_genres_string,
          vote_target: 'goat_upvotes',
          api_key: 'HUG_REST_API_KEY'
        }
      )
    ]);
  })
  .then(second_results => {
    const genres = second_results[0];
    const mgcss = second_results[1];
    const body = second_results[2];

    if (body.success === true && body.valid_key === true && body.hasOwnProperty('goat_movies')) {
      // Successful hug get request!
      if (body.goat_movies.length > 0) {
        // We've got movies to process!
        if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
          // Device has a screen!
          return Promise.all([
            [genres, mgcss, body],
            process_goat_speech(body, mgcss, genres),
            goat_rows(body)
          ]);
        } else {
          /*
            The user doesn't have a screen!
            Best practice is to only present 3 list results, not 10.
            We aught to provide some sort of paging to
          */
          let textToSpeech;
          let textToDisplay;

          if (mgcss !== `` && mgcss !== 'NONE') { // TODO: Check if the function returns '' or ' '!
            textToSpeech = `<speak>The 3 greatest ${mgcss} movies of all time, as determined by our userbase are: <break time="0.35s" />`;
            textToDisplay = `The 3 greatest ${mgcss} movies of all time, as determined by our userbase are:`;
          } else {
            textToSpeech = `<speak>` +
              `The 3 greatest movies of all time, as determined by our userbase are: <break time="0.35s" />`;
            textToDisplay = `The 3 greatest movies of all time, as determined by our userbase are:`;
          }

          textToSpeech += `<say-as interpret-as="ordinal">1</say-as> place is ${body.goat_movies[0].title},<break time="0.1s" /> released in ${body.goat_movies[0].year}. <break time="0.35s" />` +
          `<say-as interpret-as="ordinal">2</say-as> place is ${body.goat_movies[1].title},<break time="0.1s" /> released in ${body.goat_movies[1].year}. <break time="0.35s" />` +
          `<say-as interpret-as="ordinal">3</say-as> place is ${body.goat_movies[2].title},<break time="0.1s" /> released in ${body.goat_movies[2].year}. <break time="0.35s" />` +
          `</speak>`;

          textToDisplay += `1st place is ${body.goat_movies[0].title}, released in ${body.goat_movies[0].year}.` +
          `2nd place is ${body.goat_movies[1].title}, released in ${body.goat_movies[1].year}.` +
          `3rd place is ${body.goat_movies[2].title}, released in ${body.goat_movies[2].year}.`;

          chatbase_analytics(
            conv,
            `GOAT ${mgcss} movies! No screen!`, // input_message
            'goat', // input_intent
            'Win' // win_or_fail
          );

          store_repeat_response(conv, 'getGoat', textToSpeech, textToDisplay); // Storing repeat info

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
        }
      } else {
        // We didn't retrieve ANY movies!
        // TODO: Fallback!

      }
    } else if (body.success === false && body.valid_key === true) {
      /*
        We've not got movies to display!
        Perhaps this is because the user has entered too many movie genres?
      */
      let textToSpeech;
      let textToDisplay;

      if (movie_genres_string.length > 1) {
        textToSpeech = `<speak>` +
          `I'm sorry, Vote Goat was unable to find any movies with the genres ${mgcss}. <break time="0.35s" /> ` +
          `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
          `</speak>`;
        textToDisplay = `I'm sorry, Vote Goat was unable to find any movies with the genres ${mgcss}. \n\n\n\n ` +
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

      chatbase_analytics(
        conv,
        `Couldn't find any movies to show the user!`, // input_message
        'goat', // input_intent
        'Fail' // win_or_fail
      );

      store_repeat_response(conv, 'getGoat', textToSpeech, textToDisplay); // Enabling the user to repeat the fallback text...

      conv.ask(
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
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
  .then(final_results => {
    const genres_final = final_results[0][0];
    const mgcss_final = final_results[0][1];
    const body_final = final_results[0][2];
    const textToSpeech_final = final_results[1]['textToSpeech'];
    const textToDisplay_final = final_results[1]['textToDisplay'];
    const table_rows = final_results[2];
    /*
      We're ready to show off the final results to the user!
    */
    chatbase_analytics(
      conv,
      `GOAT ${mgcss_final} movies!`, // input_message
      'goat', // input_intent
      'Win' // win_or_fail
    );

    let subtitle;
    if (mgcss_final !== "NONE") {
      subtitle = `Greatest ${mgcss_final} movies of all time!`;
    } else {
      subtitle = `Greatest movies of all time!`;
    }

    conv.ask(
      new SimpleResponse({
        speech: textToSpeech_final,
        text: textToDisplay_final
      }),
      new Table({
        title: 'GOAT Movies',
        subtitle: subtitle,
        dividers: true,
        columns: ['Title', 'IMDB Rating', 'GOAT Ranking'],
        rows: table_rows
      }),
      new SimpleResponse({
        speech: '<speak>What do you want to do next?</speak>',
        text: 'What do you want to do next?'
      }),
      new Suggestions('💾 SIGIR demo',  '🎥 SIGIR Movies', '🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
    );
    store_repeat_response(conv, 'getGoat', textToSpeech_final, textToDisplay_final); // Storing repeat info
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'goat');
  });
});
