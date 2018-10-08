function generate_rec_movie_carousel (conv, quantity_top_k, rec_body, experiment_body) {
  // We want at least 3 movies to display!
  let parameters = {}; // Creating parameter holder
  let carousel_items = {}; // Creating carousel item holder
  let wordy_iterator = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'nineth', 'tenth'];

  for (let iterator = 0; iterator < quantity_top_k; iterator++) { // Iterating over the top k rec_body results!
    /*
      Given the quantity of movies returned in the JSON (eventually top-k movies), produce the carousel_items object
    */
    const index_value = iterator.toString(); // Creating string representation of index for context data
    rec_body.movies[iterator].poster_url = (rec_body.movies[iterator].poster_url).replace("http://", "https://"); // Replacing http for https for use in contexts!
    parameters[index_value] = rec_body.movies[iterator]; // Inserting the 'get_random_movie_list' rec_body contents into the context parameter.

    /*
      Only trigger if the user has a screen.
    */
    const current_movieTitle = rec_body.movies[iterator].title;
    const genre_list = helpExtract(rec_body.movies[iterator].genres);

    // Need to insert 9 movies into carousel item
    carousel_items[index_value] = {
      title: `${current_movieTitle} (${rec_body.movies[iterator].year})`,
      description: `Genres: ${genre_list}\nIMDB ⭐: ${rec_body.movies[iterator].imdbRating} 🗳: ${rec_body.movies[iterator].imdbVotes}\nAge: ${rec_body.movies[iterator].rate_desc}`,
      image: new Image({
        url: `${(rec_body.movies[iterator].poster_url).replace("http://", "https://")}`, // Replacing http for https for use in current carousel item!
        alt: `${current_movieTitle}`
      }),
      footer: `# ${iterator}`,
      synonyms: [`${iterator}`, `${wordy_iterator[iterator]}`, `${current_movieTitle}`]
    }
    // End of for loop
  }

  //conv.contexts.set('speaker_list_body', 0); // Erasing context
  conv.contexts.set('list_body', 1, parameters); // Setting the outbound context to include the JSON rec_body parameter data!

  chatbase_analytics(
    conv,
    `Experiment ID:${experiment_body.experiment_id}, HUG:${experiment_body.target_hug_function}, AB:${experiment_body.outcome}, KMOV:${quantity_top_k}, SCREEN`, // input_message
    'recommend_movie', // input_intent
    'Win' // win_or_fail
  );

  store_repeat_response(conv, 'recommendMovie', 'Alright, here are a few movies which I think you will like!', 'Alright, here are a few movies which I think you will like!'); // Storing repeat info

  if (typeof(carousel_items['3']) !== 'undefined') {
    // We've got a carousel to return!
    resolve(carousel_items);
  } else {
    // We'
    return reject(new Error('recommend_movie failure!'));
  }
}


app.intent('recommend_movie', (conv, { movieGenre }) => {
  /*
  Movie recommendation intent.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  return setup_experiment (conv, 'recommend_movie', movieGenre)
  .then(experiment_body => {
    /*
    Example experiment_body:
    {
      'experiment_id': 5,
      'target_hug_parameters': {key: val},
      'target_hug_function': 'get_random_movie_list',
      'outcome': 1
    };
    */
    return Promise.all(
      [
        experiment_body,
        hug_request('HUG', experiment_body.target_hug_function, 'GET', experiment_body.target_hug_parameters)
      ]
    );
  })
  .then(results => {
    // Let's check the retrieved hug contents
    const experiment_body_final = results[0];
    const rec_body = results[1];

    if (rec_body.success === true && rec_body.valid_key === true) {
      const quantity_top_k = rec_body.movies.length;

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        /*
          The user has a screen, let's show the carousel & suggestions
        */
        if (quantity_top_k >= 3) {
          return Promise.all(
            [
              experiment_body_final,
              rec_body,
              generate_rec_movie_carousel(conv, quantity_top_k, rec_body, experiment_body_final)
            ]
          );
        } else {
          //console.log("recommendMovie: No movies were returned! Movies SHOULD have been returned!");
          return no_movies_found(conv);
        }
      } else {
        /*
          The user doesn't have a screen. Let's show them only one movie!
          // TODO: Upgrade HUG function to accept mongodb limit() value as input parameter (for efficiency gains).
        */
        const movie_element = rec_body.movies[0]; // First movie in recommendation list
        if (quantity_top_k >= 1) {
          conv.contexts.set('list_body', 0); // Erasing context
          conv.contexts.set('list_selection', 0); // Erasing context
          conv.contexts.set('recommend_movie_context', 0); // Erasing context!
          conv.contexts.set('voted-followup', 0); // Erasing context!

          store_movie_data(conv, 'list_selection', movie_element.imdbID, movie_element.title, movie_element.plot, movie_element.year, movie_element.imdbRating, movie_element.genres);

          var textToSpeech = `<speak>`;

          let title_let = (movie_element.title).replace('&', 'and'); // & characters invalidate SSML
          conv.data.speaker_title = title_let;
          const greeting = [`How about the movie "${title_let}"? `,
                            `I found the movie "${title_let}". `,
                            `I think you might like the film "${title_let}"! `,
                            `Want to watch "${title_let}"? `,
                            `Are you interested in watching "${title_let}"? `];
          textToSpeech += greeting[Math.floor(Math.random() * greeting.length)];

          const genre_list = movie_element.genres;
          if (genre_list.length >= 1) {
            textToSpeech += `It's an ${genre_list} movie<break time="0.35s" />`;
          }

          let age_rating_text;
          if (["N/A", "NOT RATED", "UNRATED", "NR", "Not Rated", "Not rated", "Unrated"].includes(movie_element.rate_desc)) {
            // Invalid ratings
            age_rating_text = 'an unrated movie';
          } else {
            // Valid rating
            age_rating_text = `rated "${movie_element.rate_desc}"`;
          }

          textToSpeech += `which was released in ${movie_element.year}. It's ${age_rating_text}, and has an IMDB rating of ${movie_element.imdbRating} out of 10. <break time="0.35s" /> `;

          const outro = [`So, would you watch this film?`, `Interested in watching ${title_let}?`, `So, want to watch "${title_let}"`, `Is this a movie you'd consider watching?`, `Are you interested in watching "${title_let}"?`];
          textToSpeech += outro[Math.floor(Math.random() * outro.length)];

          const alternative = [
            `Or do you need more info about "${title_let}"?`,
            `Or would you like to know more about "${title_let}" first?`,
            ``,
            ``,
            ``
          ]; // 40% chance of asking
          textToSpeech += alternative[Math.floor(Math.random() * alternative.length)];

          textToSpeech += `</speak>`;

          const textToDisplay = `Title: ${title_let}\n` +
          `Year: ${movie_element.year}\n` +
          `Genre: ${genre_list}\n` +
          `IMDB Rating: ${movie_element.imdbRating}`;

          store_repeat_response(conv, 'recommend_movie', textToSpeech, textToDisplay); // Storing repeat info

          chatbase_analytics(
            conv,
            `Speaker received a movie recommendation!`, // input_message
            'recommend_movie', // input_intent
            'Win' // win_or_fail
          );

          return conv.ask(
            new SimpleResponse({
              // Sending the details to the user
              speech: textToSpeech,
              text: textToDisplay
            })
          );
        } else {
          //console.log("recommendMovie: No movies were returned! Movies SHOULD have been returned!");
          return no_movies_found(conv);
        }
      }
    } else if (rec_body.success === false && rec_body.valid_key === true && rec_body.error_message === 'Insufficient movies') {
      // We couldn't find any movies
      return no_movies_found(conv);
    } else if (rec_body.success === false && rec_body.valid_key === true && rec_body.error_message === 'Invalid user Id') {
      // We couldn't find an userId - something went extra wrong!
      return catch_error(conv, 'Invalid userId', 'recommendation');
    } else if (rec_body.success === false && rec_body.valid_key === false) {
      // Something went extra wrong!
      return catch_error(conv, 'Either incorrect key, or HUG fail!', 'recommendation');
    }
  })
  .then(final_results => {
    /*
      We've successfully generated a carousel of movies for the user to browse!
      Let's display it!
    */
    const carousel_items = final_results[3];
    conv.contexts.set('recommend_movie_context', 1, {
      "placeholder": "placeholder",
      "repeatedCarousel": carousel_items
    });

    conv.contexts.set('vote_context', 0); // Erase the context!

    return conv.ask(
      new SimpleResponse('Alright, here are a few movies which I think you will like!'),
      // Create a browse carousel
      new Carousel({
        items: carousel_items
      }),
      new Suggestions('🗳 Rank Movies', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`)
    );
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'recommendation');
  });
});
