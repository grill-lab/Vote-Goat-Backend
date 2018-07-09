app.intent('speaker_recommend_response', (conv) => {
  /*
    Intent for responding to movie recommnedation speaker responses.
    TODO:
      * GET RAW INPUT!
      * CHECK FOR REQ'D CONV DATA!
      * Check presence of conv data in user input
  */
  if (((conv.data).hasOwnProperty('speaker_rec_movie_01')) || (typeof(conv.data.speaker_rec_movie_01) !== "undefined")) {
    /*
      The conv data exists!
    */
    conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

    const speaker_rec_movie_01_list = (conv.data.speaker_rec_movie_01).split("####"); // [`${rec_body.movies[0].title`, 'first', '1st`]
    const speaker_rec_movie_02_list = (conv.data.speaker_rec_movie_02).split("####");
    const speaker_rec_movie_03_list = (conv.data.speaker_rec_movie_03).split("####");

    const raw_input = (conv.input.raw).toString();
    search_raw_input (raw_input, speaker_rec_movie_01_list, speaker_rec_movie_02_list, speaker_rec_movie_03_list)
    .then(selection => {
      // selection is going to be '1', '2' or '3'
      if ((selection === '0') || (selection === '1') || (selection === '2')) {
        // The user successfully selected the
        let movie_element = conv.contexts.get('list_body').parameters[parseInt(selection)]; // Where we'll store the JSON details of the clicked item!

        console.log(`${movie_element}`);

        const options = {
          //  HUG REST GET request parameters
          gg_id: parse_userId(conv), // Anonymous google id
          k_mov_ts: movie_element.k_mov_ts,
          clicked_movie: movie_element.imdbID, // Passing the movie ID acquired via context
          api_key: 'HUG_REST_API_KEY'
        };

        return hug_request('HUG', 'log_clicked_item', 'POST', options)
        .then(() => {
          let title_let = (movie_element.title).replace('&', 'and'); // & characters invalidate SSML
          store_movie_data(conv, 'list_selection', movie_element.imdbID, movie_element.title, movie_element.plot, movie_element.year, movie_element.imdbRating, movie_element.genres);

          const genre_list = movie_element.genres;
          const actor_list = helpExtract(movie_element.actors);
          const director_list = helpExtract(movie_element.director);

          var textToSpeech = `<speak>`;

          if (genre_list.length > 1) {
            textToSpeech += `"${title_let}" is an ${genre_list} movie, with a cast primarily comprised of ${actor_list}. <break time="0.35s" />`;
          } else if (genre_list.length === 1) {
            textToSpeech += `"${title_let}" is an ${genre_list} movie, with a cast primarily comprised of ${actor_list}. <break time="0.35s" />`;
          } else {
            textToSpeech += `The cast of "${title_let}" is primarily comprised of ${actor_list}. <break time="0.35s" />`;
          }

          textToSpeech += `It was released in ${movie_element.year}, directed by ${director_list} and has an IMDB rating of ${movie_element.imdbRating} out of 10. <break time="0.35s" /> ` +
            `Are you interested in watching "${title_let}"?` +
            `</speak>`;

          const textToDisplay = `Title: ${title_let}\n` +
          `Year: ${movie_element.year}\n` +
          `Genre: ${genre_list}\n` +
          `Director: ${director_list}\n` +
          `IMDB Rating: ${movie_element.imdbRating}`;

          store_repeat_response(conv, 'itemSelected', textToSpeech, textToDisplay); // Storing repeat info

          chatbase_analytics(
            conv,
            `User selected a recommended movie!`, // input_message
            'speaker_recommend_response', // input_intent
            'Win' // win_or_fail
          );

          return conv.ask(
            new SimpleResponse({
              // Sending the details to the user
              speech: textToSpeech,
              text: textToDisplay
            })
          );
        }) // END of the GET request!
        .catch(error_message => {
          return catch_error(conv, error_message, 'recommendation');
        });

      } else {
        // This should never trigger!
        return genericFallback(conv, `speaker_recommend_response`);
      }
    })
    .catch(() => {
      return genericFallback(conv, `speaker_recommend_response`);
    });
    //console.warn(`Speaker REC Respone: raw input = "${raw_input}",  `);

    // TODO: HANDLE FALLBACK!

  } else {
    /*
      Conv data does not exist, send them to no context handling!
    */
    consoe.log(`GOT TO THE speaker_recommend_response`);
    return handle_no_contexts(conv, 'speaker_recommend_response');
  }
});

function search_raw_input (raw_input, list1, list2, list3) {
  /*
    Search for matching list synonym within the raw_input string.
  */
  return new Promise((resolve, reject) => {
    let list_1_detections = 0;
    let list_2_detections = 0;
    let list_3_detections = 0;

    // [`${rec_body.movies[0].title`, 'first', '1st`]
    // Let's give more weight to the first iteration! To prevent ordinal triggering others titles (potentially)
    const synonym_weights = [1, 0.25, 0.25];

    for (let iterator = 0; iterator < list1.length; iterator++) {
      /*
        Iterating over the movie synonyms.
      */
      if ((raw_input).includes(list1[iterator])) {
        // The term was detected!
        list_1_detections += synonym_weights[iterator];
      } else if ((raw_input).includes(list2[iterator])) {
        // The term was detected!
        list_2_detections += synonym_weights[iterator];
      } else if ((raw_input).includes(list3[iterator])) {
        // The term was detected!
        list_3_detections += synonym_weights[iterator];
      }
    }
    if ((list_1_detections === 0) && (list_2_detections === 0) && (list_3_detections === 0)) {
      // We detected no matches!
      reject('NO_MATCH');
    } else {
      //
      if ((list_1_detections > list_2_detections) && (list_1_detections > list_3_detections)) {
        resolve('0');
      } else if ((list_2_detections > list_1_detections) && (list_2_detections > list_3_detections)) {
        resolve('1');
      } else if ((list_3_detections > list_1_detections) && (list_3_detections > list_2_detections)) {
        resolve('2');
      } else {
        /*
         They managed to trigger multiple, let's throw them to the fallback!
        */
        reject('NO_MATCH');
      }
    }
  });

}

app.intent('speaker_recommend_response.fallback', (conv) => {
  /*
    User responded unexpectedly to
  */
  if (((conv.data).hasOwnProperty('speaker_rec_movie_01')) && (typeof(conv.data.speaker_rec_movie_01) !== "undefined")) {
    /*
      The conv data exists!
    */
    const speaker_rec_movie_01_list = (conv.data.speaker_rec_movie_01).split("####");
    const speaker_rec_movie_02_list = (conv.data.speaker_rec_movie_02).split("####");
    const speaker_rec_movie_03_list = (conv.data.speaker_rec_movie_03).split("####");

    const textToSpeech = `<speak>` +
      `I didn't catch that, would you watch "${speaker_rec_movie_01_list[0]}",<break time="0.175s" /> "${speaker_rec_movie_02_list[0]}"<break time="0.175s" /> or "${speaker_rec_movie_03_list[0]}"? <break time="0.35s" /> ` +
      `</speak>`;
    const textToDisplay = `I didn't catch that, which would you watch? \n` +
                          `${rec_body.movies[0].title}? \n` +
                          `${rec_body.movies[1].title}? \n` +
                          `${rec_body.movies[2].title}? \n`;
    chatbase_analytics(
      conv,
      `Speaker movie rec fallback`, // input_message
      'speaker_recommend_response.fallback', // input_intent
      'Fail' // win_or_fail
    );

    store_repeat_response(conv, 'speaker_recommend_response.fallback', textToSpeech, textToDisplay); // Storing repeat info

    return conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      })
    );

  } else {
    /*
      Conv data does not exist, send them to no context handling!
    */
    return handle_no_contexts(conv, 'speaker_recommend_response.fallback');
  }

});
