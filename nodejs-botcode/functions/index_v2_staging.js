'use strict'; // Mandatory js style?

const {
  dialogflow,
  Suggestions,
  LinkOutSuggestionOptions,
  BasicCard,
  Button,
  SimpleResponse
} = require('actions-on-google')

const util = require('util');
const functions = require('firebase-functions'); // Mandatory when using firebase
const http = require('https'); // Required for request's https use? Or dead code?...
const requestLib = require('request'); // Used for querying the HUG.REST API
const moment = require('moment'); // For handling time.
var chatbase = require('@google/chatbase')
              .setApiKey('chatbase-api-key') // Your Chatbase API Key
              .setPlatform('Google Assistant'); // The type of message you are sending to chatbase: user (user) or agent (bot)

//const hug_nn_host = 'https://nn.domain.tld'; // This is the online neural network server!
const hug_host = 'https://prod.domain.tld'; // THIS IS THE PRODUCTION SERVER! CHANGE WHEN RUNNING STAGING TESTS!

const app = dialogflow({
  debug: true
}); // Creating the primary dialogflow app element

function catch_error(conv, error_message, intent) {
  /*
  Generic function for reporting errors & providing error handling for the user.
  */
  chatbase_analytics(
    conv,
    `Error within intent ${intent}`, // input_message
    intent, // input_intent
    'error' // win_or_fail
  );

  if(error_message instanceof Error) {
      console.error(error_message);
  } else {
      console.error(new Error(error_message));
  }
  conv.user.storage = {};
  return conv.close(
      new SimpleResponse({
      // If we somehow fail, do so gracefully!
      speech: "An unexpected error was encountered! Let's end our Vote Goat session for now.",
      text: "An unexpected error was encountered! Let's end our Vote Goat session for now."
    })
  );
}

function parse_parameter_list (input_dialogflow_parameter, separator) {
  /*
    Parse the input parameter data from dialogflow
    Outputs a parsed array string ready for the HUG REST API GET request
    Should work for any 'list' type parameter.
  */
  var parsed_array_string; // What we're going to return to the user

  if (typeof input_dialogflow_parameter !== 'undefined' && (input_dialogflow_parameter.length > 0) && Array.isArray(input_dialogflow_parameter)) { // Validating movie genre user input
    // Genres are present in the user's input
    if (separator === ', ' && input_dialogflow_parameter.length > 1) { // More than one genre? Engage!
      // For displaying a comma separated string to the user
      var editing_input_array = input_dialogflow_parameter;
      const array_size = editing_input_array.length;
      editing_input_array[array_size - 1] = 'and ' + editing_input_array[array_size - 1]; // We're setting the last actor array element to 'and <actor>'
      parsed_array_string = (editing_input_array.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.
    } else {
      // For use in HUG REST query
      parsed_array_string = input_dialogflow_parameter.join(separator); // Merge into a string for GET request
    }
  } else {
    // The input_dialogflow_parameter parameter didn't pass validation
    parsed_array_string = ' ';
  }

  return parsed_array_string; // Onwards to the HUG GET request!
}

function chatbase_analytics(conv, input_message, input_intent, win_or_fail) {
  /*
  Integrating chatbase chat bot analytics.
  Will help optimize user experience whilst minimizing privacy impact.
  */
  var lookup_user_id = conv.user.id;
  var userId;

  if (typeof lookup_user_id !== 'undefined' && lookup_user_id) {
    userId = lookup_user_id.toString();
  } else {
    userId = 'NO_USERID_SUPPLIED';
  }

  console.log(`${input_message} ${input_intent} ${userId}`);

  if (win_or_fail === 'Win') {
    // For reporting successful bot interaction
    chatbase.newMessage('chatbase-api-key')
    .setPlatform('Google Assistant')
  	.setMessage(input_message)
  	.setVersion('1.0')
  	.setUserId(userId)
    .setAsTypeUser() // sets the message as type user
    .setAsHandled() // set the message as handled -- this means the bot understood the message sent by the user
    .setIntent(input_intent) // the intent of the sent message (does not have to be set for agent messages)
    .setTimestamp(Date.now().toString()) // Only unix epochs with Millisecond precision
  	.send()
  	.then(msg => console.log(msg.getCreateResponse()))
  	.catch(err => console.error(err));
  } else {
    // For reporting fallback attempts
    chatbase.newMessage('chatbase-api-key')
    .setPlatform('Google Assistant')
    .setMessage(input_message)
    .setVersion('1.0')
    .setUserId(userId)
    .setAsTypeUser() // sets the message as type agent
    .setAsNotHandled() // set the message as not handled -- this means the opposite of the preceding
    .setIntent(input_intent) // the intent of the sent message (does not have to be set for agent messages)
    .setTimestamp(Date.now().toString()) // Only unix epochs with Millisecond precision
    .send()
    .then(msg => console.log(msg.getCreateResponse()))
    .catch(err => console.error(err));
  }
}

function hug_request(target_url, target_function, method, qs_contents) {
  // Setting URL and headers for request

  var api_host = '';
  if (target_url === 'HUG') {
    // Change this to your own HUG REST API server (if you want)
    api_host = `https://prod.domain.tld`;
  } else if (target_url === 'NN') {
    // Change this to the ML model URL
    api_host = `https://nn.domain.tld`;
  } else {
    return NONE; // This alright? Shouldn't ever trigger..
  }

  var request_options = {
    url: `${api_host}/${target_function}`,
    method: method, // GET request, not POST.
    json: true,
    headers: {
      'User-Agent': 'Vote Goat Bot',
      'Content-Type': 'application/json'
    },
    qs: qs_contents
  };

  // Return new promise
  return new Promise((resolve, reject) => {
    // Do async job
    requestLib(request_options, (err, resp, body) => {
        if (err) {
          // Returning an indication that the HUG REST query failed
          const error_message = err;
          console.log(`Error - we didn't get a proper response! URL: ${api_host}/${target_function}`);
          reject(error_message);
        } else {
          if (resp.statusCode === 200) {
            // Returning the body in a promise
            resolve(body);
          } else {
            // Don't want anything other than 200
            const error_message = resp;
            console.log("No error, but response != 200");
            reject(error_message);
          }
        }
    })
  });
}

function helpExtract(input_array) {
  // Code de-duplication! Squish JSON array down to string!
  let target_data = input_array; // NOT CONST! Because we want to potentially edit the last element to 'and actorname'
  if (Array.isArray(target_data)) {
    const quantity_elements = target_data.length; // Quantity of elements in array
    if (quantity_elements > 1) { // More than one actor? Engage!
      target_data[quantity_elements - 1] = 'and ' + target_data[quantity_elements - 1]; // We're setting the last element array element to 'and <element>'
    }
  }
  const processed_list = (target_data.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.
  return processed_list;
}

function genericFallback(conv, intent_name, fallback_messages, suggestions) {
  /*
  Generic fallback function
  */
  console.warn("GENERIC FALLBACK TRIGGERED!");
  const fallback_name = intent_name + '_Fallback';

  console.log(util.inspect(conv, false, null));

  //console.log(`Generic fallback count: ${conv.user.storage.fallbackCount}`);

  conv.user.storage.fallbackCount = parseInt(conv.user.storage.fallbackCount, 10); // Retrieve the value of the intent's fallback counter

  if (conv.user.storage.fallbackCount >= 3) {
    // Google best practice is to quit after 3 attempts
    console.log("User misunderstood 3 times, quitting!");
    chatbase_analytics(
      conv,
      'Max reprompts exceeded!', // input_message
      fallback_name, // input_intent
      'Fail' // win_or_fail
    );
    return conv.close("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
  } else {
    // Within fallback attempt limit (<3)
    console.log("HANDLED FALLBACK!");
    const current_fallback_phrase = fallback_messages[conv.user.storage.fallbackCount];
    conv.user.storage.fallbackCount++; // Iterate the fallback counter
    const fallback_speech = '<speak>' + current_fallback_phrase + '</speak>';
    const fallback_text = current_fallback_phrase;

    //console.log(`${conv.user.storage.fallbackCount} ${fallback_name} ${fallback_messages} : ${current_fallback_phrase} : ${fallback_speech}`);
    chatbase_analytics(
      conv,
      'Sucessful fallback prompt', // input_message
      fallback_name, // input_intent
      'Win' // win_or_fail
    );

    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    if (hasScreen === true) {
      // TODO: Change the buttons to reflect the previous intent
      return conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: fallback_speech,
          text: fallback_text
        }),
        new Suggestions(suggestions)
      );
    } else {
      return conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: fallback_speech,
          text: fallback_text
        })
      );
    }
  }
}

app.intent('Welcome', conv => {
  /*
  The welcome intent is the main menu, they arrive here if they launch the bot via the Google Assistant explorer.
  */

  /*
  if (conv.getContextArgument('Welcome', 'placeholder')) {
    const test = conv.contexts.get('Welcome', 'placeholder').value;
    console.log(`Context detection: ${test}`);
  } else {
    conv.user.storage.fallbackCount = 0;
  }
  */
  conv.user.storage.fallbackCount = 0;

  const welcome_param = {}; // The dict which will hold our parameter data
  welcome_param['placeholder'] = 'placeholder'; // We need this placeholder
  conv.contexts.set('home', 1, welcome_param); // We need to insert data into the 'home' context for the home fallback to trigger!

  const MENU_FALLBACK = [
    "Sorry, what do you want to do?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
  ];

  //if (conv.contexts.Welcome) {
    //const test = conv.contexts['Welcome'].value;
    //console.log(`WELCOME CONTEXT PRESENT! ${conv.contexts.Welcome}`);
  //} else {
    //console.log("NOPE!");
  //}


  // Powerful debugging trick!
  // console.log(util.inspect(conv, false, null));

  const textToSpeech = `<speak>` +
    `<emphasis level="moderate">Hey, welcome to Vote Goat!</emphasis> <break time="0.5s" /> ` +
    `Vote Goat aims to crowd source movie ratings and provide accurate movie recommendations. <break time="0.35s" /> ` +
    `What would you like to do? <break time="0.25s" /> ` +
    `Rank Movies? <break time="0.25s" /> ` +
    `Get a Movie Recommendation? <break time="0.25s" /> ` +
    `View your stats? <break time="0.25s" /> ` +
    `View the Greated movies of all time? <break time="0.25s" /> ` +
    `Or do you need help? <break time="0.25s" /> ` +
    `</speak>`;

  const textToDisplay = `Hey, welcome to Vote Goat! ` +
                        `Vote Goat aims to crowd source movie ratings & provide accurate movie recommendations. \n\n ` +
                        `What would you like to do? \n\n ` +
                        `🗳 Rank Movies? \n\n ` +
                        `🤔 Get a Movie Recommendation? \n\n ` +
                        `🏆 View your stats? \n\n ` +
                        `🐐 View GOAT movies? \n\n ` +
                        `📑 Or do you need help?`;

  chatbase_analytics(
    conv,
    'Welcome page', // input_message
    'Welcome', // input_intent
    'Win' // win_or_fail
  );

  conv.ask(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
  if (hasScreen === true) {
    conv.ask(new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`));
  }
})

app.intent('Training', (conv, { movieGenre }) => {
  /*
  The trainBot function is the primary training function.
  A basic card is shown to the user, and they are asked if they like the contents of the card.
  The user is provided suggestion chips to pivot the discussion.
  */

  const parameter = {}; // The dict which will hold our parameter data
  parameter['placeholder'] = 'placeholder'; // We need this placeholder
  conv.contexts.set('template', 1, parameter); // Need to set the data

  var movie_genres_string;

  if (typeof movieGenre !== 'undefined' && (movieGenre.length > 0)) {

    if (Array.isArray(movieGenre)) {
      // Verifying that the parameter data (which is a list) is stored in an array (workaround)
      const quantity_genres = movieGenre.length;

      if (quantity_genres > 0) {
        // Genres are actually present in the user's input
        movie_genres_string = movieGenre.join(' '); // Merge into a string for GET request
        conv.contexts.set('forward_genre', 1, { // Setting the 'forward_genre' context for the next loop
          "placeholder": "placeholder",
          "movieGenres": movie_genres_string
        });
        console.log(`Set "${movie_genres_string}" into 'forward_genre' context!`);
      } else {
        /*
        User didn't provide any genres, but they didn't come from the vote loop!
        */
        movie_genres_string = ' ';
      }
    }
  } else {
    /*
    The user may have just looped back into the trainBot function after voting, or they've supplied no genre input.
    We want to retrieve the stored genre loop data!
    Only triggers upon loop; won't trigger on first run!
    */
    //console.log(`DID YOU JUST COME FROM A LOOP?!`);

    if (conv.contexts.get('forward_genre_more', 'movieGenres')) {
      /*
      We're maintaining the genres the user input.
      This context will be active if the user came from 'plot spoilers'.
      */
      var past_movie_genres_more = conv.contexts.get('forward_genre_more', 'movieGenres').value;
      //console.log(`TEST: FORWARD_GENRE_MORE EXISTS! ${past_movie_genres_more}`);
      conv.contexts.set('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
        "placeholder": "placeholder",
        "movieGenres": past_movie_genres_more
      });
      movie_genres_string = past_movie_genres_more;
    } else if (conv.contexts.get('forward_genre', 'movieGenres')) {
      /*
      We're maintaining the genres the user input.
      This context will be active if the user voted without clicking 'plot spoilers'.
      */
      var past_movie_genres = conv.contexts.get('forward_genre', 'movieGenres').value;
      //console.log(`TEST: FORWARD_GENRE EXISTS! ${past_movie_genres}`);
      conv.contexts.set('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
        "placeholder": "placeholder",
        "movieGenres": past_movie_genres
      });
      movie_genres_string = past_movie_genres;
    } else {
      /*
       The user came from a loop & they didn't provide movie genres to begin with!
       Thus, we just set it to blank space (needs blank space for REST API GET request)
      */
      console.log(`No input parameter nor past context contents were found, setting the genre  blank!`);
      movie_genres_string = ' ';
    }
  }

  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: userId, // Anonymous google id
    genres: movie_genres_string, // The user's genre input (Possibilities: ' ', 'genre', 'genre,genre,genre,...' strings)
    actors: ' ', // If we were to add actor search, we'd specify that here.
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'get_single_training_movie', 'GET', qs_input)
  .then(body => {
    if (body.valid_key === true) {
      const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

      const intent_fallback_messages = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want A, B or C?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want A, B or C?"
      ];

      if (body.success === true) {
        // Triggers if a movie was found.
        // Retrieving data from the 'get_single_training_movie' JSON request result
        const moviePlot = body.plot;
        const plot = (body.plot).replace('&', 'and');
        const year = body.year;
        const posterURL = body.poster_url;
        const movieTitle = (body.title).replace('&', 'and');
        const imdbRating = body.imdbRating;
        const movieID = body.imdbID;

        /*
        let genres = body.genres; // NOT CONST! Because we want to potentially edit the last element to 'and genre'
        if (Array.isArray(genres)) {
          const quantity_genres = genres.length; // Quantity of genres in the genre array
          if (quantity_genres > 1) { // More than one genre? Engage!
            genres[quantity_genres - 1] = 'and ' + genres[quantity_genres - 1]; // We're setting the last actor array element to 'and <actor>'
          }
        }
        const genre_list = (genres.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

        let actors = body.actors; // NOT CONST! Because we want to potentially edit the last element to 'and actorname'
        if (Array.isArray(actors)) {
          const quantity_actors = actors.length; // Quantity of actors in the actor array
          if (quantity_actors > 1) { // More than one actor? Engage!
            actors[quantity_actors - 1] = 'and ' + actors[quantity_actors - 1]; // We're setting the last actor array element to 'and <actor>'
          }
        }
        const actor_list = (actors.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

        let directors = body.director;
        if (Array.isArray(directors)) {
          const quantity_directors = directors.length;
          if (quantity_directors > 1) { // More than one director? Engage!
            directors[quantity_directors - 1] = 'and ' + directors[quantity_directors - 1]; // We're setting the last director array element to 'and <director>'
          }
        }
        const director_list = (directors.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.
        */
        const genre_list = helpExtract(body.genres);
        const actor_list = helpExtract(body.actors);
        const director_list = helpExtract(body.director);

        let genre_speech = '';
        let genre_text = '';
        if (genre_list.length > 1) {
          genre_speech = `${movieTitle}'s genres are: ${genre_list}. <break time="0.25s" /> `;
          genre_text = `Genres: ${genre_list}. \n\n`;
        } else {
          genre_speech = `${movieTitle} is a ${genre_list} film. <break time="0.25s" /> `;
          genre_text = `Genre: ${genre_list}. \n\n`;
        }

        conv.contexts.set('vote_context', 1, { // Setting the mode for upvote/downvote to detect where we are!
          "mode": 'training', // Setting the mode for upvote/downvote to detect where we are!
          "movie": `${movieID}`, // Setting the displayed movie's imdbID into the voting context!
          "title": `${movieTitle}`, // Setting the displayed movie's imdbID into the voting context!
          "plot": `${plot}`,
          "year": `${year}`
        });

        const textToSpeech = `<speak>` +
          `I found the movie ${movieTitle}. <break time="0.5s" /> ` +
          `Released in the year ${year}, it was directed by ${director_list} and currently has an IMDB rating of ${imdbRating} out of 10. <break time="0.35s" /> ` +
          `The cast of ${movieTitle} is primarily comprised of ${actor_list}. <break time="0.25s" /> ` +
          genre_speech +
          `Would you watch ${movieTitle}?` +
          `</speak>`;

        const textToDisplay = `I found the movie "${movieTitle}". \n\n` +
            `Released in ${year}, it was directed by ${director_list} and it currently has an IMDB rating of ${imdbRating}/10. \n\n` +
            `The cast of ${movieTitle} is primarily comprised of ${actor_list}. \n\n` +
            genre_text +
            `Would you watch ${movieTitle}?`;

        conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          })
        );

        if (hasScreen === true) {
          // The user has a screen, let's show them a card & suggestion buttons.
          conv.ask(
            new BasicCard({
              title: `${movieTitle} (${year})`,
              text: `Plot: ${plot}`,
              buttons: new Button({
                title: `🍿 Look for "${movieTitle}" on Google Play?`,
                url: `https://play.google.com/store/search?q=${movieTitle}&c=movies`,
              }),
              image: { // Mostly, you can provide just the raw API objects
                url: `${posterURL}`,
                accessibilityText: `${movieTitle}`,
              },
              display: 'WHITE'
            }),
            new Suggestions(`👍`, `👎`, `📜 plot spoilers`, `🤔 recommend me a movie`, '📑 Help', `🚪 Back`),
            new LinkOutSuggestion({
              text: '📺 YouTube',
              url: `https://www.youtube.com/results?search_query=${movieTitle}+${year}`
            })
          );
        }
      } else {
        conv.contexts.set('home', 1, { // Setting the mode for upvote/downvote to detect where we are!
          "placeholder": 'placeholder'
        });

        const textToSpeech = `<speak>` +
                            `Sorry, Vote Goat couldn't find relevant movies. Please use fewer movie genres. What do you want to do next? <break time="0.5s" /> ` +
                            `</speak>`;

        const displayText = `Sorry, Vote Goat couldn't find relevant movies. Please use fewer movie genres. What do you want to do next?`;

        conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          })
        );

        if (hasScreen === true) {
          conv.ask(
            new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`)
          );
        }

      } // End of else
    } else {
      return catch_error(conv, 'Invalid Hug API KEY!', 'template_intent');
    }
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
})

app.intent('moreMovieInfo', (conv)) => {
  /*
  The purpose of the 'moreMovieDetails' function is to read aloud the movie's plot summary to the user during the training phase.
  Uses a GET request, talks to HUG and is quite verbose.
  The plot was inserted into the card, as reading it aloud would be too disruptive.
  */
  const intent_fallback_messages = = [
    `Sorry, what was that?`,
    `Sorry, I didn't catch that, would you watch ${movie_title}?`,
    `I'm sorry, I didn't understand that. Would you cosider watching ${movie_title}?`
  ];

  if (conv.contexts.get('vote_context', 'mode')) {
    if (conv.contexts.get('forward_genre', 'movieGenres')) {
      /*
      We're maintaining the genres the user input.
      */
      const movie_genres_string = conv.contexts.get('forward_genre', 'movieGenres').value;
      console.log(`mMD - Setting 'forward_genre_more' to: ${movie_genres_string}`);
      conv.contexts.set('forward_genre_more', 1, { // We're now looping the last input genre until the user provides a new set of parameters
        "placeholder": "placeholder",
        "movieGenres": movie_genres_string
      });
    } else {
      console.log(`forward_genre was not detected within mMD!`);
    }

    console.log("moreMovieDetails Running!");
    conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!
    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    const requested_mode = conv.contexts.get('vote_context', 'mode').value; // Retrieving the expected voting mode (within a list, or during training)!
    const movie_imdb_id = conv.contexts.get('vote_context', 'movie').value; // Retrieving the movie we want to downvote!
    const movie_title = conv.contexts.get('vote_context', 'title').value; // Retrieving the title
    const movie_year = conv.contexts.get('vote_context', 'year').value; // Retrieving the plot
    let movie_plot = conv.contexts.get('vote_context', 'plot').value; // Retrieving the plot

    let intro_text = `Warning! ${movie_title} plot spoilers! `;
    let confirmation_text = `Would you watch "${movie_title}"?`;
    let additional_text = `I found the movie ${movie_title}`;
    let plot_minus_text = intro_text.length + confirmation_text.length + additional_text.length;
    let plot_text_limit = 635 - plot_minus_text; // Need to take the intro text length into account, not just the plot!

    if (movie_plot.length > plot_text_limit) {
      movie_plot = movie_plot.substring(0, plot_text_limit) + '...'; // Limiting the length of the plot, preventing invalidation of simple response!
    }

    conv.contexts.set('moreMovieInfo', 1, { // We're setting a placeholder value to trigger the 'moreMovieInfo fallback'. Without, it won't trigger!
      "placeholder": "placeholder"
    });

    conv.contexts.set('vote_context', 1, { // Specifying the data required to vote!
      "mode": requested_mode,
      "movie": movie_imdb_id
    });

    const textToSpeech = `<speak>` +
      `Warning! ${movie_title} plot spoilers! <break time="0.75s" /> ` +
      `${movie_plot} <break time="1.5s" /> ` +
      `Now that you know the plot of ${movie_title}, would you consider watching it? <break time="0.35s" /> ` +
      `</speak>`;

    const textToDisplay = `⚠️ Warning! "${movie_title}" plot spoilers! 🙉 \n\n` +
      `"${movie_plot}"`;

    conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      })
    );

    if (hasScreen === true) {
      if (requested_mode === 'list_selection') {
        conv.ask(
          new Suggestions(`👍`, `👎`, '🗳 Rank Movies', '📑 Help', `🚪 Back`),
          new LinkOutSuggestion({
            text: '📺 YouTube',
            url: `https://www.youtube.com/results?search_query=${movieTitle}+${year}`
          })
        );
      } else {
        conv.ask(
          new Suggestions(`👍`, `👎`, `🤔 recommend me a movie`, '📑 Help', `🚪 Back`);
        );
      }
    }
  } else {
    /*
    The 'vote_context' context is not present.
    */
    handle_no_contexts(conv);
  }
}

app.intent('voted', (conv, { voting })) = {
  /*
  Provides voting functionality.
  There used to be separate functions for up/down voting - refactored into a single function!
  */
  const intent_fallback_messages = [
    `Sorry, what was that?`,
    `Sorry, I didn't catch that, would you watch ${movie_title}?`,
    `I'm sorry, I didn't understand that. Would you cosider watching ${movie_title}?`
  ];

  if (conv.contexts.get('vote_context', 'mode')) {
    const requested_mode = conv.contexts.get('vote_context', 'mode').value; // Retrieving the expected voting mode (within a list, or during training)!
    const movie_imdb_id = conv.contexts.get('vote_context', 'movie').value; // Retrieving the movie we want to downvote!

    //console.log(`CHECK VOTES: ${voting}, IS IT AN ARRAY? ${Array.isArray(voting)}, LENGTH: ${voting.length}`);

    var voting_intention = 1; // Default is upvote! This could be simplified to 'var voting_intention;' perhaps.

    if (Array.isArray(voting)) { // Verifying that voting is an array
      /*
         'voting' is a list of upvote/downvote entries
         There can be several positive/negative terms provided.
         We want to determine if what the user said was majoritively positive/negative.
      */
      const quantity_votes = voting.length;
      if (quantity_votes > 0) {
        // Good, we heard the user voting!

        let upvotes = 0; // Quantity of upvotes in the voting list
        let downvotes = 0; // Quantity of downvotes in the voting list

        // Let's count the occurrences of upvote & downvote in the voting_array
        for (var index = 0; index < quantity_votes; index++) {
          if (voting[index] === 'upvote') {
            upvotes++; // increment!
          } else if (voting[index] === 'downvote') {
            downvotes++; // increment!
          } else {
            /*
            This section of code should never trigger.
            */
            console.log(`Why is ${voting[index]} present?!`);
            continue; // MOVE ALONG, PEOPLE! Nothing to see here!
          }
        }
        console.log(`upvotes: ${upvotes}, downvotes: ${downvotes}`);
        if (upvotes > 0 && downvotes > 0) {
          if (upvotes >= downvotes) { // If upvotes==downvotes, assume an upvote due to uncertainty!
            voting_intention = 1; // Confirming that the voting intention is 1
          } else {
            voting_intention = 0; // Changing the default vote intention to 0
          }
        } else {
          if (upvotes > downvotes) { // If upvotes==downvotes, assume an upvote due to uncertainty!
            voting_intention = 1; // Confirming that the voting intention is 1
          } else {
            voting_intention = 0; // Changing the default vote intention to 0
          }
        }
      } else {
        // We didn't hear any valid input from the user!
        console.log("VOTE ERROR: NO VOTES!");
        votingFallback(app);
      }
    } else {
      console.log("ERROR: Vote is not stored in an array! Has the workaround been removed?");
      serious_error_encountered(app);
    }

    console.log(`VOTING ACTION: ${requested_mode}, imdbID: ${movie_imdb_id}, vote intention: ${voting_intention}`);

    const qs_input = {
      //  HUG REST GET request parameters
      gg_id: userId, // Anonymous google id
      movie_id: movie_imdb_id, // Passing the movie ID acquired via context
      rating: voting_intention, // The rating we're setting for the movie we just displayed to the user.
      mode: requested_mode,
      api_key: 'API_KEY'
    };

    return hug_request('HUG', 'submit_movie_rating', 'GET', qs_input)
    .then(body => {
      if (body.valid_key === true) {
        const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
        if (requested_mode === 'training') {
          /*
          Detect if the user is in the training mode, if so, loop them!
          */
          conv.redirect.intent('Training'); // We recursively send them to the primary trainBot function.
        } else if (requested_mode === 'list_selection') {
          /*
          User voted from within the movie recommendation section.
          We want to provide them an appropriate response & prompt them for the next step.
          */
          var textToSpeech;
          var speechToText;

          // TODO: Make the following less verbose? Perhaps based on recent usage levels.

          if (voting_intention === 1) {
            // The user upvoted
            const movie_title = conv.contexts.get('vote_context', 'title').value; // Retrieving the expected voting mode (within a list, or during training)!
            textToSpeech = `<speak>` +
              `Huzzah, a successful movie recommendation! <break time="0.25s" /> ` +
              `Try looking for ${movie_title} on YouTube or the Google Play store. <break time="0.5s" /> ` +
              `What do you want to do next? Rank movies, get another movie recommendation or quit?` +
              `</speak>`;
            speechToText = `Huzzah, a successful movie recommendation! \n\n` +
              `Try looking for ${movie_title} on YouTube or the Google Play store. \n\n` +
              `What do you want to do next? Rank movies, get another movie recommendation or quit?`;
          } else {
            // The user does not like the movie (Overall downvote)
            // If we kept track of how many times they recently saw this intent then we could reduce text repetition.
            textToSpeech = `<speak>` +
              `Sorry about that. <break time="0.25s" /> ` +
              `Try ranking more movies to improve your future recommendations. <break time="0.5s" /> ` +
              `What do you want to do next? Rank movies, view your stats, get help or quit?` +
              `</speak>`;
            speechToText = `Sorry about that. \n\n` +
              `Try ranking more movies to improve future recommendations. \n\n` +
              `What do you want to do next? Rank movies, view your stats, get help or quit?`;
          }

          conv.contexts.set('final_prompt', 1, {
            'placeholder': 'placeholder',
            'voting_intention': voting_intention
          });

          conv.ask(
            new SimpleResponse({
              speech: textToSpeech,
              text: speechToText
            })
          );

          if (hasScreen === true) {
            conv.ask(
              new Suggestions('🗳 Rank Movies', '🤔 recommend me a movie', '🏆 Show Stats', `🚪 Quit`),
            );
          }
        } else {
          console.log('An error was encountered in upvote function');
          small_error_encountered(app); // Minor failure handling
          return catch_error(conv, 'No voting mode detected!', 'voting intent');
        }
      } else {
        // This will only trigger if the API key changes.
        // Better than an unhandled crash!
        return catch_error(conv, 'Invalid Hug API KEY!', 'voting intent');
      }
    })
    .catch(error_message => {
      return catch_error(conv, error_message, 'training');
    });

  } else {
    // No 'vote_cotext' context detected!
    handle_no_contexts(app);
  }
}

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

app.intent('getLeaderboard', (conv)) = {
  /*
    We want to gamify the bot, so that we encourage people to vote as much as possible.
    The more voting data we have, the better recommendations we can provide to everyone!
  */
  const intent_fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
  ];

  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: userId, // Anonymous google id
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
  .then(body => {
    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    if (body.success === true && body.valid_key === true) {

      var textToSpeech;
      var displayText;

      if (body.total_movie_votes > 0) {
        textToSpeech = `<speak>` +
          `You're currently ranked <say-as interpret-as="ordinal">${body.movie_leaderboard_ranking}</say-as> out of ${body.quantity_users} users! <break time="0.5s" /> ` +
          `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! <break time="1.5s" /> ` +
          `What do you want to do next? Rank Movies, or get a Movie Recommendation? <break time="0.25s" /> ` +
          `</speak>`;

        textToDisplay = `You're currently ranked ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users! \n\n ` +
          `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! \n\n ` +
          `What do you want to do next? Rank Movies, or get a Movie Recommendation?`;
      } else {
        textToSpeech = `<speak>` +
          `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
          `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> ` +
          `</speak>`;

        textToDisplay = `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
          `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> `;
      }

      conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      if (hasScreen === true && body.total_movie_votes > 0) {
        conv.ask(
          new BasicCard({
            title: `You're rank ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users!`,
            text: `🗳 Keep ranking movies to improve your leaderboard position! Note that 30 days of inactivity will wipe your statistics!`,
            /*buttons: new Button({
              title: `🍿 Share user ranking`,
              url: ``, // TODO: Auto-generate an image or web page for users to save a certificate of leaderboard ranking with their friends
            }),
            image: { // Mostly, you can provide just the raw API objects
              url: `${movie_element.poster_url}`,
              accessibilityText: `${movie_element.title}`,
            },*/
            display: 'WHITE'
          })
        );
      }

      if (hasScreen === true) {
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendations', '📑 Help', '🚪 quit')
        );
      }

    } else {
      // Something wrong with the hug function..
      return catch_error(conv, 'Unexpected error!', 'getLeaderBoards');
    }

  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
}

app.intent('recommendMovie', (conv)) = {

  const intent_fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want A, B or C?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want A, B or C?"
  ];

  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: userId, // Anonymous google id
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
  .then(body => {
    if (body.valid_key === true) {
    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    const ab_vars = {
      //  HUG REST GET request parameters
      gg_id: userId, // Anonymous google id
      api_key: 'API_KEY'
    };

    return hug_request('HUG', 'get_ab_value', 'GET', ab_vars)
    .then(ab_body => {
      if (ab_body.success === true) {
        var ab_value = ab_body.ab_value // Either 0 or 1
        const ab_recommendation_options = {
          //  HUG REST GET request parameters
          gg_id: userId, // Anonymous google id
          api_key: 'API_KEY'
        };

        var target_recommendation_function;
        if (ab_value === 1) {
          // This is how we implement basic AB testing.
          // The user gets either a 0 or 1 from HUG, which determines the model.
          // Potential improvements:
          //  * Rather than getting AB value from HUG, flip a coin/die to determine % based AB testing targeting (10% probability of being picked, etc.

          //url = `get_nn_list`; // Recommendation models
          target_recommendation_function = `get_random_movie_list`; // Random
        } else {
          target_recommendation_function = `get_random_movie_list`; // Random
        }

        return hug_request('HUG', target_recommendation_function, 'GET', ab_recommendation_options)
        .then(rec_body => {
          if (rec_body[0].success === true && rec_body[0].valid_key === true) {
            const quantity_top_k = rec_body.length; // NOT PROVEN! Get the quantity of movies in top-k results.

            if (quantity_top_k > 0) {

              let movie_list = []; // Where we'll store the list elements
              var parameters = {}; // Creating parameter holder
              var carousel_items = {} // Creating carousel item holder

              for (var iterator = 0; iterator < quantity_top_k; iterator++) { // Iterating over the top k rec_body results!
                /*
                Given the quantity of movies returned in the JSON (eventually top-k movies),
                produce the 'buildOptionItem' element and store it in the 'movie_list' list.
                */

                if (iterator > 9) {
                   // Can't place more than 10 items in the carousel!
                  break;
                } else {
                  // Extracting neccessary data from the returned HUG JSON response
                  const index_value = index.toString(); // Creating string representation of index for context data
                  const current_movieTitle = rec_body[index].title;
                  const current_movieYear = rec_body[index].year;
                  const current_posterURL = rec_body[index].poster_url;

                  /*
                  let genres = rec_body[index].genres; // NOT CONST! Because we want to potentially edit the last element to 'and genre'
                  if (Array.isArray(genres)) {
                    const quantity_genres = genres.length; // Quantity of genres in the genre array
                    if (quantity_genres > 1) { // More than one genre? Engage!
                      genres[quantity_genres - 1] = 'and ' + genres[quantity_genres - 1]; // We're setting the last actor array element to 'and <actor>'
                    }
                  }
                  const genre_list = (genres.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.
                  */
                  const genre_list = helpExtract(rec_body[index].genres);

                  parameters[index_value] = rec_body[index]; // Inserting the 'get_random_movie_list' rec_body contents into the context parameter.

                  // Need to insert 9 movies into carousel item
                  carousel_items[index_value] = {
                    new BrowseCarouselItem({
                      title: `${current_movieTitle}`,
                      description: `Genres: ${genre_list}`,
                      image: new Image({
                        url: `${current_posterURL}`,
                        alt: `${current_movieTitle}`,
                      }),
                      footer: `# ${iterator}`,
                      synonyms: [`${iterator}`, `${current_movieTitle}`]
                    })
                  };
                }
              }

              conv.contexts.set('list_body', 1, parameters); // Setting the outbound context to include the JSON rec_body parameter data!

              if (hasScreen === true) {
                conv.ask(
                  new SimpleResponse('Alright, here are a few movies which I think you will like!'),
                  // Create a browse carousel
                  new BrowseCarousel({
                    items: carousel_items
                  }),
                  new Suggestions('🗳 Rank Movies', '🏆 Show Stats', '📑 Help', `🚪 Back`)
                );
              } else {
                /*
                Best practice (according to Google) for presenting list/carousel items to speaker-only users is to only provide the first 3 movies.
                We still hold the data for movies 0-9 in the background, but we only tell the user about the first 3.
                This can be changed at any time by adding lines w/ incremented '${rec_body[x].title}' tags.
                */
                const textToSpeech = `<speak>` +
                  `Would you watch the following movies? <break time="0.25s" /> ` +
                  `${rec_body[0].title}? <break time="0.35s" /> ` +
                  `${rec_body[1].title}? <break time="0.35s" /> ` +
                  `${rec_body[2].title}? <break time="0.35s" /> ` +
                  `</speak>`;

                // Do we even need to provide the speakers text to display? Will potentially throw a warning?
                const textToDisplay = `Would you watch the following movies? ` +
                                      `${rec_body[0].title}? ` +
                                      `${rec_body[1].title}? ` +
                                      `${rec_body[2].title}? `;

                conv.ask(
                  new SimpleResponse({
                    speech: textToSpeech,
                    text: textToDisplay
                  })
                );

              }

              // UH-OH, Can't forwards the RichResponse nor carousel through contexts anymore!
              // Perhaps unreachable code too?
              conv.contexts.set('recommend_movie_context', 1, {
                "placeholder": "placeholder",
                "repeatedRichResponse": RichResponse, // REMOVE ENTIRELY? NOT USED!
                "repeatedCarousel": carousel // REPLACE WITH CAROUSEL INNER 'ITEM' OBJECT?
              });

            } else {
              console.log("recommendMovie: No movies were returned! Movies SHOULD have been returned!");
              // RATHER THAN SENDING TO ERROR, REDIRECT TO FALLBACK?
              return catch_error(conv, 'No movies found', 'recommendation');
            }
          } else {
            return catch_error(conv, 'Either incorrect key, or HUG fail!', 'recommendation');
          }

        })
        .catch(error_message => {
          return catch_error(conv, error_message, 'recommendation');
        });
      }
    }) // END of the GET request!
    .catch(error_message => {
      return catch_error(conv, error_message, 'recommendation');
    });
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
}

app.intent('dislikeRecommendations', (conv)) = {
  /*
  Erasing the contexts then sending users to training mode!
  */
  conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts!

  console.log("USER Disliked all recommendations!");
  if (conv.contexts.get('list_body', '0')) {
    var iterator_max;
    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    if (hasScreen === true) {
      // Showing devices with a screen 10 items
      iterator_max = 9;
    } else {
      // For speakers, skipping submitting bad ratings to movies 3-9 (not displayed to them).
      iterator_max = 2;
    }

    for (var iterator = 0; iterator < 10; iterator++) { // Iterating over the top k body results!

      if (iterator > iterator_max) {
        break; // Greater than 9 is invalid.
      } else {
        let string_iterator = iterator.toString();
        let movie_element = conv.contexts.get('list_body', string_iterator).value;
        let movie_imdb_id = movie_element.imdbID;

        const options = {
          url: `${hug_host}/submit_movie_rating`,
          method: 'POST', // POST request, not GET.
          json: true,
          headers: {
            'User-Agent': 'Vote Goat Bot',
            "Content-Type": "application/json"
          },
          form: { // form because this is a post action
            gg_id: userId, // Anonymous google id
            movie_id: movie_imdb_id, // Passing the movie ID acquired via context
            rating: 0, // The rating we're setting for the movie we just displayed to the user.
            mode: 'multi vote',
            api_key: 'API_KEY'
          }
        };
        requestLib(options, (err, httpResponse, body) => {
          if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
            console.log(`mass downvote!`);
          } else {
            console.log('An error was encountered in downvote function');
            small_error_encountered(app); // Minor failure handling
          }
        })
      }
    } // End of loop

    var textToSpeech;
    var speechToText;

    if (hasScreen === true) {
      // Device has a screen
      textToSpeech = `<speak>` +
        `Sorry for providing poor movie recommendations. <break time="0.25s" /> ` +
        `Please try ranking more movies to improve future recommendations. <break time="0.5s" /> ` +
        `What do you want to do next? Rank movies, view your stats, get help or quit?` +
        `</speak>`;
      speechToText = `Sorry for providing poor movie recommendations. \n\n` +
        `Please try ranking more movies to improve future recommendations. \n\n` +
        `What do you want to do next? Rank movies, view your stats, get help or quit?`;
    } else {
      // Device is speaker only
      textToSpeech = `<speak>` +
        `Sorry for providing poor movie recommendations. <break time="0.25s" /> ` +
        `Please try ranking more movies to improve future recommendations. <break time="0.5s" /> ` +
        `What do you want to do next? Rank movies, view your stats, get help or quit?` +
        `</speak>`;
      speechToText = `Sorry for providing poor movie recommendations.` +
        `Please try ranking more movies to improve future recommendations.` +
        `What do you want to do next? Rank movies, view your stats or quit?`;
    }

    conv.ask(
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech,
        text: speechToText
      })
    );

    if (hasScreen === true) {
      conv.ask(
        new Suggestions('🗳 Rank Movies', '🏆 Show Stats', `🚪 Quit`)
      );
    }


    // Unneccessary?
    //
    // conv.contexts.get('final_prompt', 1, {
    //   'placeholder': 'placeholder',
    //   'voting_intention': 0
    // });
  } else {
    // This shouldn't trigger, but better safer than sorry!
    handle_no_contexts(app);
  }
}

app.intent('itemSelected', (conv)) = {
  /*
  Helper for carousel - reacting to item selection.
  Code from: https://developers.google.com/actions/assistant/helpers#getting_the_results_of_the_helper_1
  Get & compare the user's selections to each of the item's keys
  The param is set to the index when looping over the results to create the addItems contents.
  */
  if (conv.contexts.get('list_body', '0')) {
    console.log("INSIDE: itemSelected");
    const param = app.getSelectedOption(); // Getting the clicked list item!
    var movie_element; // Where we'll store the JSON details of the clicked item!

    conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts!

    if (!param) {
      // How did they manage this? Let's kick them out!
      conv.close('You did not select any item from the list or carousel, for safety the bot will quit.');
    } else if (param === '0') {
      movie_element = conv.contexts.get('list_body', '0').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '1') {
      movie_element = conv.contexts.get('list_body', '1').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '2') {
      movie_element = conv.contexts.get('list_body', '2').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '3') {
      movie_element = conv.contexts.get('list_body', '3').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '4') {
      movie_element = conv.contexts.get('list_body', '4').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '5') {
      movie_element = conv.contexts.get('list_body', '5').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '6') {
      movie_element = conv.contexts.get('list_body', '6').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '7') {
      movie_element = conv.contexts.get('list_body', '7').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '8') {
      movie_element = conv.contexts.get('list_body', '8').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else if (param === '9') {
      movie_element = conv.contexts.get('list_body', '9').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
    } else {
      // They somehow clicked on something not in the carousel, abandon ship!
      conv.close('You selected an unknown item from the list or carousel, for safety the bot will quit.');
    }

    const options = {
      url: `${hug_host}/log_clicked_item`,
      method: 'POST', // POST request, not GET.
      json: true,
      headers: {
        'User-Agent': 'Vote Goat Bot',
        "Content-Type": "application/json"
      },
      form: { // form because this is a post action
        gg_id: userId, // Anonymous google id
        k_mov_ts: movie_element.k_mov_ts,
        clicked_movie: movie_element.imdbID, // Passing the movie ID acquired via context
        api_key: 'API_KEY'
      }
    };

    requestLib(options, (err, httpResponse, body) => {
      if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
        console.log('Successfully posted the clicked item to hug/mongodb!');
      } else {
        console.log('An error was encountered in the itemSelected (POST) function');
        small_error_encountered(app); // Minor failure handling
      }
    })

    conv.contexts.get('recommend_movie_context', 0, { // Duration 0 to erase the context!
      "placeholder": "placeholder",
      "repeatedRichResponse": "", // Erasing context!
      "repeatedCarousel": "" // Erasing context!
    });

    conv.contexts.get('item_selected_context', 1, { // Placeholder to initialize/trigger the 'item_selected_context' context.
      "placeholder": "placeholder"
    });

    var title_var = (movie_element.title).replace('&', 'and'); // & characters invalidate SSML
    var plot_var = (movie_element.plot).replace('&', 'and'); // & characters invalidate SSML

    conv.contexts.get('vote_context', 1, { // Setting the mode for upvote/downvote to detect where we are!
      "mode": 'list_selection', // Setting the mode for upvote/downvote to detect where we are!
      "movie": `${movie_element.imdbID}`, // Setting the displayed movie's imdbID into the voting context!
      "title": `${movie_element.title}`, // Setting the displayed movie's imdbID into the voting context!
      "plot": `${movie_element.plot}`, // Getting the plot from the selected movie
      "year": `${movie_element.year}` // Placing the year value into the voting context!
    });

    const genre_list = helpExtract(movie_element.genres);
    const actor_list = helpExtract(movie_element.actors);
    const director_list = helpExtract(movie_element.director);

    const textToSpeech1 = `<speak>` +
      `"${title_var}" is a ${genre_list} movie, with a cast primarily comprised of ${actor_list}. <break time="0.35s" />` +
      `It was released in ${movie_element.year}, directed by ${director_list} and has an IMDB rating of ${movie_element.imdbRating} out of 10. <break time="0.35s" /> ` +
      `Are you interested in watching "${title_var}"?` +
      `</speak>`;

    const textToDisplay1 = `Title: ${title_var}\n` +
    `Genre: ${title_var}\n` +
    `Director: ${title_var}\n` +
    `IMDB Rating: ${title_var}\n` +
    `Title: ${title_var}\n` +
    `Title: ${title_var}\n` +

    const textToDisplay1 = `"${title_var}" was released in ${movie_element.year}, it was directed by ${director_list} and it currently has an IMDB rating of ${movie_element.imdbRating}/10. \n\n` +
      `The cast of ${title_var} is primarily comprised of ${actor_list}. \n\n` +
      genre_text;

    const textToSpeech2 = `Are you interested in watching ${title_var}?`;
    const textToDisplay2 = `Are you interested in watching ${title_var}?`;

    conv.ask(
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech1,
        text: textToDisplay1
      }),
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech2,
        text: textToDisplay2
      })
    );

    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    if (hasScreen === true) {
      conv.ask(
        new BasicCard({
          title: `${movie_element.title} (${movie_element.year})`,
          text: `Plot: ${movie_element.plot}`,
          buttons: new Button({
            title: `🍿 Google Play Search`,
            url: `https://play.google.com/store/search?q=${movie_element.title}&c=movies`,
          }),
          image: { // Mostly, you can provide just the raw API objects
            url: `${movie_element.poster_url}`,
            accessibilityText: `${movie_element.title}`,
          },
          display: 'WHITE'
        }),
        new Suggestions(`👍`, `👎`, `📜 plot spoilers`, '🗳 Rank Movies', '🏆 Show Stats', '📑 Help', `🚪 Back`),
        new LinkOutSuggestion({
          text: '📺 YouTube',
          url: `https://www.youtube.com/results?search_query=${movieTitle}+${year}`
        })
      );
    }
  } else {
    // Shouldn't happen, but better safe than sorry!
    handle_no_contexts(app);
  }
} // end of itemSelected function!

app.intent('input.unknown', conv => {
  /*
  Fallback used when the Google Assistant doesn't understand which intent the user wants to go to.
  */
  console.log("Unknown intent fallback triggered!");
  //conv.user.storage.fallbackCount = 0;
  const intent_fallback_messages = [
    "Sorry, what was that?",
    "I didn't catch that. What do you want to do in Vote Goat??",
    "I'm having trouble understanding. Want to rank movies or get movie recommendations?"
  ];

  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]

  return genericFallback(conv, `bot.fallback`, intent_fallback_messages, suggestions);
})

app.intent('getHelpAnywhere', conv => {
  /*
  Provides the user the ability to get help anywhere they are in the bot.
  Pretty much a duplicate of the welcome/home function, minus the greeting!
  */
  const help_anywhere_parameter = {}; // The dict which will hold our parameter data
  help_anywhere_parameter['placeholder'] = 'placeholder'; // We need this placeholder
  conv.contexts.set('help_anywhere', 1, help_anywhere_parameter); // We need to insert data into the 'home' context for the home fallback to trigger!

  const intent_fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
  ];

  const textToSpeech = `<speak>` +
    `I heard you're having some problems with Vote Goat? <break time="0.35s" /> ` +
    `You can rank movies by saying Rank Movies.` +
    `You can get personal movie recommendations by saying Recommend me a movie.` +
    `You can get your stats by saying Get Stats. ` +
    `You can get a list of the greatest horror movies of all time by saying show me goat horror movies.` +
    `</speak>`;

  const textToSpeech2 = `<speak>` +
    `When ranking movies, you can ask for plot spoilers. ` +
    `You can specify the genre of movies to rank by saying rank funny scary movies. ` +
    `What do you want to do next? Rank Movies, or get a Movie Recommendation?` +
    `</speak>`;

  const textToDisplay = `I heard you're having some problems with Vote Goat? \n\n` +
               `You can rank movies by saying Rank Movies. \n\n` +
               `You can get personal movie recommendations by saying Recommend me a movie. \n\n` +
               `You can get your stats by saying Get Stats. \n\n` +
               `You can get a list of the greatest horror movies of all time by saying show me goat horror movies.`;

  const textToDisplay2 = `When ranking movies, you can ask for plot spoilers. \n\n` +
               `You can specify the genre of movies to rank by saying rank funny scary movies. \n\n` +
               `What do you want to do next? Rank Movies, or get a Movie Recommendation?`;

  conv.ask(
    new SimpleResponse({
      // Sending the details to the user
      speech: textToSpeech,
      text: textToDisplay
    }),
    new SimpleResponse({
      // Sending the details to the user
      speech: textToSpeech2,
      text: textToDisplay2
    })
  );

  const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
  if (hasScreen === true) {
    let possible_genres = "Action, Romantic, Animation, Fantasy, Adventure, Comedy, Sci-Fi, Crime, Documentary, Drama, Family, Film-Noir, Horror, Musical, Mystery, Short, Thriller, War, Western, Biography & Sport";

    conv.ask(
      new BasicCard({
      title: `🎥 Supported Movie Genres`,
      text: `${possible_genres}`,
      //buttons: new Button({
      //  title: 'Vote Goat ',
      //  url: `https://URL`,
      //}),
      display: 'WHITE'
      }),
      new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🚪 Quit`)
    );
  }
})

app.intent('goodbye', conv => {
  /*
  Elaborate goodbye intent
  */
  const textToSpeech = `<speak>` +
    `Sorry to see you go, come back soon? <break time="0.35s" /> ` +
    `Goodbye.` +
    `</speak>`;
  const speechToText = `Sorry to see you go, come back soon? \n\n` +
    `Goodbye.`;

  chatbase_analytics(
    conv,
    'Goodbye', // input_message
    'Goodbye', // input_intent
    'Win' // win_or_fail
  );

  conv.user.storage = {};
  conv.close(
    new SimpleResponse({
      // Sending the details to the user
      speech: textToSpeech,
      text: displayText
    })
  );
})

app.catch((conv, error_message) => {
  /*
    Generic error catch
  */
  console.error(error_message);
  conv.user.storage = {};
  return catch_error(conv, error_message, 'Worker.One');
})

exports.VoteGoat = functions.https.onRequest(app)
