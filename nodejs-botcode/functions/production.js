'use strict'; // Mandatory js style?

// Requirements & Global vars:

const { dialogflow, Suggestions, BasicCard, Button, Carousel, Table, Image, SimpleResponse, BrowseCarousel, BrowseCarouselItem} = require('actions-on-google');
const functions = require('firebase-functions'); // Mandatory when using firebase
const requestLib = require('request'); // Used for querying the HUG.REST API
//const util = require('util'); // Used for debugging conv

let chatbase = require('@google/chatbase')
              .setApiKey('CHATBASE_API_KEY') // Your Chatbase API Key
              .setPlatform('Google Assistant'); // The type of message you are sending to chatbase: user (user) or agent (bot)

const hug_host = 'https://subdomain.domain.tld';

const app = dialogflow({
  // Creating the primary dialogflow app element
  debug: true,
  verification: {
    // Dialogflow authentication
    'key': 'value'
  }
});

////////////// Helper functions

function erase_storage_data (conv) {
  /*
    We're storing data but not clearing it up, we should erase some of it occassionally!
  */
  const targets_to_erase = ['voting_move', 'voting_movieID', 'voting_movieTitle', 'voting_moviePlot', 'voting_movieYear', 'voting_genres', 'voting_actors', 'voting_director', 'useridstorage_user_1'];

  var target_length = targets_to_erase.length;
  for (var i = 0; i < target_length; i++) {
    if ((conv.user.storage).hasOwnProperty(targets_to_erase[i])) {
      conv.user.storage[targets_to_erase[i]] = "";
    }
  }
}

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

  // Let's clean up the old data:
  erase_storage_data(conv);

  return conv.close(
      new SimpleResponse({
      // If we somehow fail, do so gracefully!
      speech: "An unexpected error was encountered! Let's end our Vote Goat session for now.",
      text: "An unexpected error was encountered! Let's end our Vote Goat session for now."
    })
  );
}

function hug_request(target_url, target_function, method, qs_contents) {
  // Setting URL and headers for request

  let api_host = '';
  if (target_url === 'HUG') {
    // Change this to your own HUG REST API server (if you want)
    api_host = hug_host;
  }/* else if (target_url === 'NN') {
    // Change this to the ML model URL
    api_host = hug_nn_host;
  }*/

  let request_options = {
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
  // Required instead of await/async because firebase uses nodejs 6
  return new Promise((resolve, reject) => {
    // Do async job
    requestLib(request_options, (err, resp, body) => {
        if (err) {
          // Returning an indication that the HUG REST query failed
          const error_message = err;
          console.log(`HUG Server Error - we didn't get a proper response! URL: ${api_host}/${target_function}`);
          reject(error_message);
        } else {
          if (resp.statusCode === 200) {
            // Returning the body in a promise
            resolve(body);
          } else {
            // Don't want anything other than 200
            const error_message = resp;
            console.error(`Invalid HUG: ${body}`);
            reject(error_message);
          }
        }
    })
  });
}

function chatbase_analytics(conv, input_message, input_intent, win_or_fail) {
  /*
  Integrating chatbase chat bot analytics.
  Will help optimize user experience whilst minimizing privacy impact.
  */
  // TODO: Change the UserID used here!
  return new Promise((resolve, reject) => {
    // Do async job
    let userId;
    if (typeof(conv.user.id) !== 'undefined') {
      userId = (conv.user.id).toString();
    } else {
      userId = 'NO_USERID_SUPPLIED';
    }

    //console.log(`${input_message} ${input_intent} ${userId}`);

    if (win_or_fail === 'Win') {
      // For reporting successful bot interaction
      chatbase.newMessage('CHATBASE_API_KEY')
      .setPlatform('Google Assistant')
    	.setMessage(input_message)
    	.setVersion('1.0')
    	.setUserId(userId)
      .setAsTypeUser() // sets the message as type user
      .setAsHandled() // set the message as handled -- this means the bot understood the message sent by the user
      .setIntent(input_intent) // the intent of the sent message (does not have to be set for agent messages)
      .setTimestamp(Date.now().toString()) // Only unix epochs with Millisecond precision
    	.send()
    	.then(msg => {
        //console.log(msg.getCreateResponse());
        resolve("Success");
      })
    	.catch(err => {
        console.error(err);
        reject("Failure");
      });
    } else {
      // For reporting fallback attempts
      chatbase.newMessage('CHATBASE_API_KEY')
      .setPlatform('Google Assistant')
      .setMessage(input_message)
      .setVersion('1.0')
      .setUserId(userId)
      .setAsTypeUser() // sets the message as type agent
      .setAsNotHandled() // set the message as not handled -- this means the opposite of the preceding
      .setIntent(input_intent) // the intent of the sent message (does not have to be set for agent messages)
      .setTimestamp(Date.now().toString()) // Only unix epochs with Millisecond precision
      .send()
      .then(msg => {
        //console.log(msg.getCreateResponse());
        resolve("Success");
      })
    	.catch(err => {
        console.error(err);
        reject(`Failure`);
      });
    }
  });
}

function store_movie_data (conv, mode, movieID, movieTitle, plot, year, imdb_rating, genres, actor_list, director_list) {
  /*
    Storing the data into the vote_context parameters.
    Not persistent data storage & pretty messy..
  */
  conv.contexts.set('vote_context', 1, { // Setting the mode for upvote/downvote to detect where we are!
    "mode": `${mode}`, // Setting the mode for upvote/downvote to detect where we are!
    "movie": `${movieID}`, // Setting the displayed movie's imdbID into the voting context!
    "title": `${movieTitle}`, // Setting the displayed movie's imdbID into the voting context!
    "plot": `${plot}`,
    "imdb_rating": `${imdb_rating}`,
    "genres": `${genres}`,
    "actors": `${actor_list}`,
    "directors": `${director_list}`,
    "year": `${year}`
  });

  /*
    Conversation data storage - could be temporary like contexts!
    TODO: Trigger no-context situation & see if conv.data persists or only conv.user.storage persists!
  */
  conv.data.voting_mode = mode;
  conv.data.voting_movieID = movieID; // Setting the movie ID for no-context backup!
  conv.data.voting_movieTitle = movieTitle;
  conv.data.voting_moviePlot = plot;
  conv.data.voting_movieYear = year;
  conv.data.voting_genres = genres;
  conv.data.voting_actors = actor_list;
  conv.data.voting_director = director_list;

  /*
    User storage - persists between conversations!
    Could remove, but its extra data in dialogflow logs 👍
  */
  conv.user.storage.voting_mode = mode;
  conv.user.storage.voting_movieID = movieID;
  conv.user.storage.voting_movieTitle = movieTitle;
  conv.user.storage.voting_moviePlot = plot;
  conv.user.storage.voting_movieYear = year;
  conv.user.storage.voting_genres = genres;
  conv.user.storage.voting_actors = actor_list;
  conv.user.storage.voting_director = director_list;

  return new Promise((resolve, reject) => {
    resolve('Complete');
  });
}

function store_repeat_response (conv, intent_name, speech, text) {
  /*
    A function for easily storing the response data.
    Takes in the speech & text previously presented to the user.
  */
  conv.data.last_intent_name = intent_name;
  conv.user.storage.last_intent_name = intent_name;
  conv.data.last_intent_prompt_speech = speech;
  conv.data.last_intent_prompt_text = text;

  return new Promise((resolve, reject) => {
  // Do async job
    resolve('Complete');
  });
}

function store_fallback_response (conv, fallback_messages, suggestions) {
  /*
    Function for storing fallback messages in the conv data storage.
  */
  // 1st fallback
  conv.data.fallback_text_0 = fallback_messages[0];
  conv.data.fallback_speech_0 = '<speak>' + fallback_messages[0] + '</speak>';
  // 2nd fallback
  conv.data.fallback_text_1 = fallback_messages[1];
  conv.data.fallback_speech_1 = '<speak>' + fallback_messages[1] + '</speak>';
  // NOTE: No 3rd fallback - we will quit!

  // Storing the comma separated suggestion string in conv data
  return parse_parameter_list(suggestions, ', short')
  .then(suggestion_string => {
    conv.data.suggestions = suggestion_string;
  });
}

function interpret_voting_intention (conv, voting) {
  /*
    Function for interpreting the user's voting intention from the 'voting' list input parameter.
    'voting' is a list of upvote/downvote entries
    There can be several positive/negative terms provided.
    We want to determine if what the user said was majoritively positive/negative.
    Outputs either a 0 or 1 (down/upvote).
  */

  return new Promise((resolve, reject) => {
    if (Array.isArray(voting) && voting.length > 0) {
      // Good, we heard the user voting!
      var voting_intention; // V
      let upvotes = 0; // Quantity of upvotes in the voting list
      let downvotes = 0; // Quantity of downvotes in the voting list

      // Let's count the occurrences of upvote & downvote in the voting_array
      for (let index = 0; index < voting.length; index++) {
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
      if (upvotes > 0 || downvotes > 0) {
        if (upvotes >= downvotes) {
          /*
            User upvoted!
            If (upvotes==downvotes) { we assume an upvote due to uncertainty }
          */
          voting_intention = 1;
        } else {
          /*
            User downvoted!
          */
          voting_intention = 0;
        }
        resolve(voting_intention); // Return the voting intention
      } else {
        reject("No voting detected");
      }
    } else {
      // For use in HUG REST query
      reject("No voting detected");
    }
  });

}

function goat_rows (body) {
  /*
    This function is for generating the GOAT table rows.
    Currently the Table element is not available in production, but it is a great way of presenting this information!
  */
  var goat_rows_list = [];

  for (let index = 0; index < body.goat_movies.length; index++) {
    goat_rows_list[index] = [(body.goat_movies[index].title).toString(), (body.goat_movies[index].imdb_rating).toString(), (body.goat_movies[index].goat_score).toString()];

    /*
    "imdbID": "tt1375666",
    "year": 2010,
    "title": "Inception",
    "imdb_rating": 8.8,
    "runtime": "148 min",
    "upvotes": 44,
    "downvotes": 6,
    "goat_score": "0.880"
    */
  }

  return new Promise((resolve, reject) => {
    // Do async job
    resolve(goat_rows_list);
  });
}

function getGetOrdinal(n) {
  /*
    Takes number, returns ordinal equivelant.
    Source: https://stackoverflow.com/a/31615643/9065060
  */
  var s=["th","st","nd","rd"],
  v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
 }

function check_recent_activity (conv, voting_intention) {

  if (conv.data.recent_activity === 'undefined') {
    // If value in conv doesn't exist, let's initialize it!
    conv.data.recent_activity = 1;
  } else {
    // Every subsequent call within conv will iterate this value!
    conv.data.recent_activity += 1;
  }

  return new Promise((resolve, reject) => {
  // Do async job
    if (typeof(conv.data.recent_activity) !== 'undefined') {
      /*
        The user has recent_activity in their user storage
        How often should we trigger activity messages?
          * Most users are short term users, however once v2 is out this may change. Big achievements may never trigger!
          * Could be an exponential thing?
      */
      // TODO: React to upvoting | downvoting intention
      const upvote = [
        'Cool!',
        'Glad to hear.',
        'Me too!',
        'I like it too!',
        'Yeah, me too.',
        'Yay!',
        'Nice one!',
        'Fantastic!',
        'Awesome!'
      ];

      const downvote = [
        `Can't like em all! `,
        `Hmm, that's a shame. `,
        `Sorry about that. `,
        `Yeah, I get what you mean. `,
        `Hmm, me neither. `,
        `I don't like it either. `,
        `Fair enough. `,
        `Understandable.. `,
        `Hmm.. `
      ];

      const encourage_progress = [
        "Onto the next one! 📽",
        "Keep on voting! 💬",
        "You've got this! 😜",
        'Keep on ranking! 🍿',
        'Keep it up 👍',
        'Gotta rank em all! 💯',
        '', // Blank entries so that we don't over-encourage the user!
        '',
        '',
        '',
        '',
        ''
      ];

      var progress_response = ``;

      if (voting_intention === 1) {
        progress_response += upvote[Math.floor(Math.random() * upvote.length)];
      } else {
        progress_response += downvote[Math.floor(Math.random() * downvote.length)];
      }

      progress_response += ` `;
      progress_response += encourage_progress[Math.floor(Math.random() * encourage_progress.length)];

      if (conv.data.recent_activity > 1) {
        // More than 1 recent activity
        const rnd_num = Math.floor(Math.random() * 10);

        if (rnd_num >= 8) {
          /*
            Rather than just providing a progress response, we'll give them an update regarding their leaderboard position!
            We don't want to remind them of their leaderboard position every notification.
            30% activation rate
          */
          const qs_input = {
           //  HUG REST GET request parameters
           gg_id: parse_userId(conv), // Anonymous google id
           api_key: 'HUG_REST_API_KEY'
          };

          return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
          .then(body => {
            if (body.success === true && body.valid_key === true) {

              const  total_movie_votes = body.total_movie_votes; // How many movies the user has ranked
              //const  total_movie_upvotes = body.total_movie_upvotes; //
              //const  total_movie_downvotes = body.total_movie_downvotes;
              const  movie_leaderboard_ranking = getGetOrdinal(body.movie_leaderboard_ranking); // The user's ranking
              const  quantity_users = body.quantity_users;

              const possible_leaderboard_notifications = [
                `You're now ${movie_leaderboard_ranking} in Vote Goat leaderboards! Keep on voting!`,
                `Wow, you've voted ${total_movie_votes} times, you sure know your movies!`,
                `😱 Incredible! You've ranked ${total_movie_votes} movies, keep it up!`,
                `💯 Wow, you're in ${movie_leaderboard_ranking} place, keep on voting!`,
                `🎉 Great work, you've ranked ${total_movie_votes} movies so far!`,
                `Wow you're ahead of ${quantity_users-(body.movie_leaderboard_ranking)} other users in the leaderboards! Keep on ranking!`
              ]; // TODO: Add more notifications!

              resolve(possible_leaderboard_notifications[Math.floor(Math.random() * possible_leaderboard_notifications.length)]); // Return randomly selected notification
            } else {
              // Returning a normal progress speech
              resolve(progress_response);
            }
          })
          .catch(error_message => {
           /*
            TODO: Do we want to report an error or just resolve a static message?
            Technically if this occurs then something is wrong with HUG & the rest of the bot probably isn't operational..
           */
           return catch_error(conv, error_message, 'progress_notification');
           //resolve(progress_speech[activity_index]); // Could use this instead
          });
        } else {
          /*
            We don't want to show the user a leaderboard notification, let's show a normal progress message.
          */
          resolve(progress_response);
        }
      } else {
        // The user hasn't triggered a motivation prompt!
        resolve(progress_response);
      }

    } else {
      // There was no recent activity value found
      const error_message = 'Progress notification: No recent activity detected!';
      reject(error_message);
    }
  });
}

function setup_experiment (conv, intent_name, movieGenreParameter) {
  /*
    This function will retrieve the latest experiment data for the current intent.
    We will roll the dice in here & decide which experiment we want to implement.
  */

  /*
  const required_parameters = {
    //  HUG REST GET request parameters
    gg_id: parse_userId(conv), // Anonymous google id
    intent: intent_name,
    api_key: 'HUG_REST_API_KEY'
  };
  */
  //return hug_request('HUG', 'get_experiment_values', 'GET', required_parameters)
  return hug_request('HUG', 'get_experiment_values', 'GET', {gg_id: parse_userId(conv), intent: intent_name, api_key: 'HUG_REST_API_KEY'})
  .then(body => {
    if (body.success === true && body.valid_key === true) {
      /*
        We've successfully retrieved an experiment for the current intent!

        Example Entry:
        {
          "experiment_details": {
            "intent": "recommend_movie",
            "experiment_id": 2,
            "target_hug_function": {
              "0": "get_random_movie_list",
              "1": "get_random_movie_list"
            },
            "target_hug_parameters": {
              "0": {
                "sort_target": "imdbVotes",
                "sort_direction": "DESCENDING"
              },
              "1": {
                "sort_target": "goat_upvotes",
                "sort_direction": "ASCENDING"
              }
            },
            "probabilities": {
              "0": 80,
              "1": 20
            }
          },
          "success": true,
          "valid_key": true,
          "took": 0.03855
        }
      */

      return new Promise((resolve, reject) => {
        /*
          We need to return data back through a promise.
          The following code does some random number generation to pick between 0 & 1 (A|B).
        */
        return parse_parameter_list(movieGenreParameter, ',')
        .then(movie_genres_string => {
            /*
              We've processed the genre parameter list.
              We'll now roll the dice & resolve the appropriate outcome!
            */
            conv.user.storage.movieGenre = movie_genres_string;
            const probability_value_0 = body.experiment_details.probabilities["0"];
            const probability_value_1 = body.experiment_details.probabilities["1"];
            const rnd_num = Math.floor((Math.random() * (probability_value_0 + probability_value_1)));

            if ((rnd_num >= 0) && (rnd_num <= probability_value_0)) {
              // Trigger "0" (A)
              //console.debug(`DEBUG: ${probability_value_0}, ${probability_value_1}, ${rnd_num}, "${movie_genres_string}, 0"`);
              chatbase_analytics(
                conv,
                `Experiment #${body.experiment_details.experiment_id}: Rolled 0`, // input_message
                intent_name, // input_intent
                'Win' // win_or_fail
              );
              resolve({
                'experiment_id': body.experiment_details.experiment_id,
                'target_hug_parameters': Object.assign(
                                          {
                                            'genres': movie_genres_string,
                                            'experiment_id': body.experiment_details.experiment_id,
                                            'experiment_group': 0
                                          },
                                          {gg_id: parse_userId(conv), intent: intent_name, api_key: 'HUG_REST_API_KEY'},
                                          body.experiment_details.target_hug_parameters["0"]
                                        ),
                'target_hug_function': body.experiment_details.target_hug_function["0"],
                'outcome': 0
              });
            } else if ((rnd_num > probability_value_0) && (rnd_num <= (probability_value_0 + probability_value_1))) {
              // Trigger "1" (B)
              //console.debug(`DEBUG: ${probability_value_0}, ${probability_value_1}, ${rnd_num}, "${movie_genres_string}, 1"`);
              chatbase_analytics(
                conv,
                `Experiment #${body.experiment_details.experiment_id}: Rolled 1`, // input_message
                intent_name, // input_intent
                'Win' // win_or_fail
              );
              resolve({
                'experiment_id': body.experiment_details.experiment_id,
                'target_hug_parameters': Object.assign(
                                          {
                                            'genres': movie_genres_string,
                                            'experiment_id': body.experiment_details.experiment_id,
                                            'experiment_group': 1
                                          },
                                          {gg_id: parse_userId(conv), intent: intent_name, api_key: 'HUG_REST_API_KEY'},
                                          body.experiment_details.target_hug_parameters["1"]
                                        ),
                'target_hug_function': body.experiment_details.target_hug_function["1"],
                'outcome': 1
              });
            }
        })
        .catch(error_message => {
          return catch_error(conv, error_message, 'setup_experiment_parse_parameter');
        });
      });
    } else if (body.success === false && body.valid_key === true) {
      /*
        We were unable to retrieve an experiment from MongoDB.
        This should never occur.
      */
      return catch_error(conv, 'No experiment found', `setup_experiment_${intent_name}`);
    }else if (body.success === false && body.valid_key === false) {
      return catch_error(conv, 'Either incorrect key, or HUG fail!', `setup_experiment_${intent_name}`);
    }
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'recommendation');
  });
}

////////////// UserId related:

////////////// UserId related:

function lookup_user_id (conv) {
  /*
    Simplify retrieving userId
  */
  return conv.user.id;
}

function register_userId (conv, user_id_string) {
  /*
    Registering an input UserId in MongoDB
  */
  return hug_request('HUG', 'create_user', 'GET', {gg_id: user_id_string, api_key: 'HUG_REST_API_KEY'})
  .then(body => {
    const user_existed = body.user_existed;
    const created_user = body.created_user;

    if (user_existed === false && created_user === true) {
      // UserId successfully registered on MongoDB
      console.log("Account created!");
    } else if (user_existed === true && created_user === false) {
      // The UserId was unseen on the mobile device, but already registered on MongoDB.
      console.log("Account already existed!");
    }
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'user_registration');
  });
}

function parse_userId (conv) {
  /*
    Look up userId in local storage, if non-existant then register userId, otherwise return the existing userId.
    TODO: Migrate to Google's single sign on authentication mechanism & identify users by hash+salted google account id.
    https://developers.google.com/actions/identity/user-info
  */

  if (((conv.user.storage).hasOwnProperty('useridstorage')) || (typeof(conv.data.fallbackCount) !== "undefined")) {
    /*
      The 'useridstorage' object exists, let's check its contents!
    */
    if (conv.user.storage.useridstorage === lookup_user_id(conv)) {
      // The UserId was previously stored in user storage
      console.log(`Property exists - returned ${lookup_user_id(conv)}`);
      return lookup_user_id(conv); // Return the user's id
    } else {
      // UserId has not been seen before - replace the stored item & register the new userId
      console.log(`Non matching existing property - registered & returned ${lookup_user_id(conv)}`);
      register_userId(conv, lookup_user_id(conv));
      conv.user.storage.useridstorage = lookup_user_id(conv); // Storing the newest UserId
      return lookup_user_id(conv); // Return the user's id
    }
  } else {
    /*
      The UserId storage did not exist.
      Register user & store data!
    */
    console.log(`Property non-existant - registered & returned ${lookup_user_id(conv)}`)
    conv.user.storage.useridstorage = lookup_user_id(conv);
    register_userId(conv, lookup_user_id(conv));
    return lookup_user_id(conv); // Return the user's id
  }
}

//////////////  Parameter related functions:

function parse_parameter_list (input_dialogflow_parameter, separator) {
  /*
    Parse the input parameter data from dialogflow
    Outputs a parsed array string ready for the HUG REST API GET request
    Should work for any 'list' type parameter.
    TODO: Remove reference to 'movies' in the variable names, since it's generic.
  */
  var movie_genres_string; // What we're going to return to the user

  return new Promise((resolve, reject) => { // No reject route? Don't want to duplicate code in promise chains
  //return new Promise((resolve, reject) => {
    // Do async job
    if ((typeof(input_dialogflow_parameter) !== 'undefined') && (input_dialogflow_parameter.length > 0) && Array.isArray(input_dialogflow_parameter)) {
      // Genres are present in the user's input
      if (separator === ', verbose' && input_dialogflow_parameter.length > 1) { // More than one genre? Engage!
        // For displaying a comma separated string to the user
        var editing_input_array = input_dialogflow_parameter;
        const array_size = editing_input_array.length;
        editing_input_array[array_size - 1] = 'and ' + editing_input_array[array_size - 1]; // We're setting the last actor array element to 'and <actor>'
        movie_genres_string = (editing_input_array.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.
        //console.log(`PPL: commas & multiple genres! ${movie_genres_string}`)
        resolve(movie_genres_string);
      } else if (separator === ', short' && input_dialogflow_parameter.length > 1) { // More than one genre? Engage!
        // For displaying a comma separated string to the user
        movie_genres_string = (input_dialogflow_parameter.join(', ')); // Merge into a string, optimize gramar.
        resolve(movie_genres_string);
      } else if (separator === ',' && input_dialogflow_parameter.length > 1) {
        /*
          For use in HUG REST query - returns a space separated string of input genres.
        */
        movie_genres_string = input_dialogflow_parameter.join(separator); // Merge into a string for GET request
        //console.log(`PPL: space & multiple genres! ${movie_genres_string}`)
        resolve(movie_genres_string);
      } else if (input_dialogflow_parameter.length === 1) {
        // Single genre!
        //console.log(`PPL: single genre! ${movie_genres_string}`)
        movie_genres_string = input_dialogflow_parameter.toString();
        resolve(movie_genres_string);
      } else {
        // No genre detected!
        // This shouldn't ever trigger!
        //console.log(`PPL: No genre detected!`);
        movie_genres_string = "NONE";
        resolve(movie_genres_string);
      }
    } else {
      // The input_dialogflow_parameter parameter didn't pass validation
      // This could mean that no parameter was detected!
      //console.log("parse parameter list: ELSE STATEMENT");
      movie_genres_string = "NONE";
      resolve(movie_genres_string);
    }
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

function fallback_body (conv, fallback_name) {
  /*
    Reducing code duplication.
    We don't check for the existence of
  */
  if (conv.data.fallbackCount > 1) {
    // Google best practice is to quit upon the 3rd attempt
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
    const text_target = 'fallback_text_' + (conv.data.fallbackCount).toString();
    const speech_target = 'fallback_speech_' + (conv.data.fallbackCount).toString();
    conv.data.fallbackCount++; // Iterate the fallback counter

    let fallback_text;
    let fallback_speech;
    let suggestions;

    if ((conv.data).hasOwnProperty(text_target)) {
      fallback_text = conv.data[text_target];
    } else {
      fallback_text = 'Sorry, what do you want to do next?';
    }

    if ((conv.data).hasOwnProperty(speech_target)) {
      // The
      fallback_speech = conv.data[speech_target];
    } else {
      fallback_speech = '<speak>Sorry, what do you want to do next?</speak>'
    }

    if ((conv.data).hasOwnProperty('suggestions')) {
      // There were suggestions stored in conv data.
      suggestions = (conv.data.suggestions).split(', ');
    } else {
      suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
    }

    store_repeat_response(conv, fallback_name, fallback_speech, fallback_text); // Enabling the user to repeat the fallback text...

    chatbase_analytics(
      conv,
      'Sucessful fallback prompt', // input_message
      fallback_name, // input_intent
      'Win' // win_or_fail
    );

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
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
  // END
}

function genericFallback(conv, intent_name) {
  /*
  Generic fallback function
  */
  const fallback_name = intent_name + '_Fallback';

  //console.log(util.inspect(conv, false, null)); // DEBUG function!

  if ((!(conv.data).hasOwnProperty('fallbackCount')) || (typeof(conv.data.fallbackCount) === "undefined")) {
    /*
      The user's past conversation has expired - we need to handle unprepared fallbacks.
      Both contexts and conv.data expire after a certain period of inactivity.
    */
    conv.data.fallbackCount = 0 // Set the fallback to 0, enabling genericFallback to work

    conv.data.fallback_text_0 = "Sorry, what do you want to do next?";
    conv.data.fallback_speech_0 = "<speak>Sorry, what do you want to do next?</speak>";

    conv.data.fallback_text_1 = "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or quit?";
    conv.data.fallback_speech_1 = "<speak>I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or quit?</speak>";

    conv.data.suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
    return fallback_body(conv, fallback_name);
  } else {
    /*
      The user has an ongoing conversation during this fallback.
      We have the required data to proceed.
    */
    return fallback_body(conv, fallback_name);
  }
}

////////////// Voting intent

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
    return hug_request('HUG', experiment_body.target_hug_function, 'GET', experiment_body.target_hug_parameters)
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
        var suggestions; // Will change based on success outcome

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

          return store_fallback_response(conv, fallback_messages, suggestions)
          .then(() => {
            return store_movie_data(conv, 'training', movieID, movieTitle, plot, year, imdbRating, genre_list, actor_list, director_list)
            .then(() => {
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

              return store_repeat_response(conv, 'Training', textToSpeech, textToDisplay) // Storing repeat info
              .then(() => {
                chatbase_analytics(
                  conv,
                  `Showed user ${movieTitle} (${movieID})`, // input_message
                  'get_single_unrated_movie', // input_intent
                  'Win' // win_or_fail
                );

                conv.ask(
                  new SimpleResponse({
                    speech: textToSpeech,
                    text: textToDisplay
                  })
                );

                if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                  // The user has a screen, let's show them a card & suggestion buttons.
                  conv.ask(
                    new BasicCard({
                      title: `${movieTitle} (${year})`,
                      subtitle: `IMDB Id: ${movieID}`,
                      text: `IMDB Rating: ${imdbRating}  Genres: ${genre_list}  Age rating: ${rate_desc}`,
                      buttons: new Button({
                        title: `🍿 Watch "${movieTitle}"`,
                        url: `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://play.google.com/store/search?q=${movieTitle}&c=movies`,
                      }),
                      image: { // Mostly, you can provide just the raw API objects
                        url: `${posterURL}`,
                        accessibilityText: `${movieTitle}`
                      },
                      display: 'WHITE'
                    }),
                    new Suggestions(suggestions)
                  );
                }
              });
            });
          });
        } else {
          const textToSpeech = `<speak>` +
                              `Sorry, Vote Goat couldn't find any movies. Please use fewer movie genres. What do you want to do next? <break time="0.5s" /> ` +
                              `</speak>`;

          const textToDisplay = `Sorry, Vote Goat couldn't find relevant movies. Please use fewer movie genres. What do you want to do next?`;

          store_repeat_response(conv, 'Recommendation_fail', textToSpeech, textToDisplay); // Storing repeat info

          const fallback_messages = [
            "Sorry, what do you want to do?",
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

          conv.ask(
            new SimpleResponse({
              speech: textToSpeech,
              text: textToDisplay
            })
          );

          if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
            conv.ask(
              new Suggestions(suggestions)
            );
          }

        } // End of else
      } else {
        /*
          Invalid HUG REST API KEY
        */
        return catch_error(conv, 'Invalid Hug API KEY!', 'get_single_unrated_movie');
      }
    })
    .catch(error_message => {
      return catch_error(conv, error_message, 'get_single_unrated_movie');
    });
  }) // END of the GET request!
  .catch(error_message => {
    return catch_error(conv, error_message, 'get_single_unrated_movie');
  });
}

////////////// Google Assistant Intents:

app.intent('Welcome', conv => {
  /*
  The welcome intent is the main menu, they arrive here if they launch the bot via the Google Assistant explorer.
  */
  conv.data.fallbackCount = 0;

  // Let's clean up the old data:
  erase_storage_data(conv);

  /*
  const welcome_param = {}; // The dict which will hold our parameter data
  welcome_param['placeholder'] = 'placeholder'; // We need this placeholder
  conv.contexts.set('home', 1, welcome_param); // We need to insert data into the 'home' context for the home fallback to trigger!
  */

  parse_userId(conv); // Will attempt to register the user

  const fallback_messages = [
    "Sorry, what do you want to do?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
  ];
  const suggestion_chips = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestion_chips);

  // Powerful debugging trick!
  // console.log(util.inspect(conv, false, null));

  let textToSpeech;
  let textToDisplay;

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    // User has a screen.
    if (conv.user.last.seen) {
      // User has used the bot before
      textToSpeech = `<speak>` +
        `<emphasis level="moderate">Welcome back to Vote Goat!</emphasis> <break time="0.5s" /> ` +
        `What would you like to do today? <break time="0.25s" /> ` + //added today to make it more personalised
        `</speak>`;

      textToDisplay = `Welcome back to Vote Goat. What would you like to do today?`;
    } else {
      // Never seen the user before
      textToSpeech = `<speak>` +
        `<emphasis level="moderate">Hey, I'm Vote Goat!</emphasis> <break time="0.5s" /> ` +
        `I crowdsource movie ratings and provide movie recommendations. <break time="0.35s" /> ` + // We can replace the first 2 lines with "Lets get started" When the user is coming for the second time.
        `What would you like to do today? <break time="0.25s" /> ` + //added today to make it more personalised
        `</speak>`;

        textToDisplay = `Hey, I'm Vote Goat! I crowdsource movie ratings and provide movie recommendation. What would you like to do today?`;
    }
  } else {
    // User doesn't have a screen.
    if (conv.user.last.seen) {
      // User has used the bot before
      textToSpeech = `<speak>` +
        `<emphasis level="moderate">Welcome back to Vote Goat!</emphasis> <break time="0.5s" /> ` +
        `What would you like to do today? <break time="0.25s" /> ` + //added today to make it more personalised
        `Rank Movies? <break time="0.25s" /> ` +
        `Get movie recommendations? <break time="0.25s" /> ` + //Can we add a More Options after this line, so that it will only read 3 options
        `View SIGIR demo? <break time="0.25s" /> ` +
        `View SIGIR rated movies? <break time="0.25s" /> ` +
        `View the Greated movies of all time? <break time="0.25s" /> ` +  //Full list can also be displayed at the first time and splitted at next attempt
        `View leaderboard? <break time="0.25s" /> ` +            // the remaining options can be read when the user clicks more.
        `Or do you need help? <break time="0.25s" /> ` +
        `</speak>`;

        textToDisplay = `Welcome back to Vote Goat! What would you like to do today?`;
    } else {
      // Never seen the user before
      textToSpeech = `<speak>` +
        `<emphasis level="moderate">Hey, I'm Vote Goat!</emphasis> <break time="0.5s" /> ` +
        `I crowdsource movie ratings and provide movie recommendations. <break time="0.35s" /> ` + // We can replace the first 2 lines with "Lets get started" When the user is coming for the second time.
        `What would you like to do today? <break time="0.25s" /> ` + //added today to make it more personalised
        `Rank Movies? <break time="0.25s" /> ` +
        `Get movie recommendations? <break time="0.25s" /> ` + //Can we add a More Options after this line, so that it will only read 3 options
        `View SIGIR demo? <break time="0.25s" /> ` +
        `View SIGIR rated movies? <break time="0.25s" /> ` +
        `View the Greated movies of all time? <break time="0.25s" /> ` +  //Full list can also be displayed at the first time and splitted at next attempt
        `View leaderboard? <break time="0.25s" /> ` +            // the remaining options can be read when the user clicks more.
        `Or do you need help? <break time="0.25s" /> ` +
        `</speak>`;

      textToDisplay = `Hey, I'm Vote Goat! I crowdsource movie ratings and provide movie recommendation. What would you like to do today?`;
    }
  }
  store_repeat_response(conv, 'Welcome', textToSpeech, textToDisplay); // Storing repeat info

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

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    conv.ask(new Suggestions(suggestion_chips));
  }
});

app.intent('Training', (conv, { movieGenre }) => {
  /*
    This intent is for ranking movies.
    Calls a helper function so it can be called repeatedly.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  return get_single_unrated_movie(conv, movieGenre);
});

app.intent('moreMovieInfo', (conv) => {
  /*
  The purpose of the 'moreMovieDetails' function is to read aloud the movie's plot summary to the user during the training phase.
  Uses a GET request, talks to HUG and is quite verbose.
  The plot was inserted into the card, as reading it aloud would be too disruptive.
  */
  if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
    // vote context exists
    if (typeof(conv.contexts.get('vote_context').parameters['mode']) !== 'undefined') {
      // mode exists within vote context
      conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

      const requested_mode = conv.contexts.get('vote_context').parameters['mode']; // Retrieving the expected voting mode (within a list, or during training)!
      const movie_imdb_id = conv.contexts.get('vote_context').parameters['movie']; // Retrieving the movie
      const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the title
      let movie_plot = conv.contexts.get('vote_context').parameters['plot']; // Retrieving the plot

      const fallback_messages = [
        `Sorry, what was that?`,
        `Sorry, I didn't catch that, would you watch ${movie_title}?`,
        `I'm sorry, I didn't understand that. Would you cosider watching ${movie_title}?`
      ];

      var suggestions;

      if (requested_mode === 'list_selection') {
        suggestions = [`👍`, `👎`,  `🍿 Watch movie online`, '🗳 Rank Movies', `🐐 GOAT Movies`, '💾 SIGIR demo', '🏆 Show Stats', '📑 Help'];
      } else {
        suggestions = [`👍`, `👎`,  `🍿 Watch movie online`, `🤔 recommend me a movie`, `🐐 GOAT Movies`, '💾 SIGIR demo', '🏆 Show Stats', '📑 Help'];
      }

      store_fallback_response(conv, fallback_messages, suggestions);

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

      /*
      // NOTE: We can just set an outbound 'vote_context' w/ lifetime 1 in moreMovieInfo's Dialogflow intent page
      conv.contexts.set('vote_context', 1, { // Specifying the data required to vote!
        "mode": requested_mode,
        "movie": movie_imdb_id
      });
      */

      let textToSpeech_prequel = `<speak>Here's more info on ${movie_title}! <break time="0.5s" /> ${movie_title}`;
      let textToDisplay_prequel = `Here's more info on ${movie_title}!\n\n`;

      if (conv.contexts.get('vote_context').parameters['year'] !== null && conv.contexts.get('vote_context').parameters['year'] !== 'undefined') {
        textToSpeech_prequel += ` was released in the year ${conv.contexts.get('vote_context').parameters['year']},`
        textToDisplay_prequel += `Released in ${conv.contexts.get('vote_context').parameters['year']}.\n`;
      }
      if (conv.contexts.get('vote_context').parameters['genres'] !== null && conv.contexts.get('vote_context').parameters['genres'] !== 'undefined') {
        textToSpeech_prequel += ` it's an ${conv.contexts.get('vote_context').parameters['genres']} movie,`;
        textToDisplay_prequel += `Genres: ${conv.contexts.get('vote_context').parameters['genres']}.\n`;
      }
      if (conv.contexts.get('vote_context').parameters['directors'] !== null && conv.contexts.get('vote_context').parameters['directors'] !== 'undefined') {
        textToSpeech_prequel += ` it was directed by ${conv.contexts.get('vote_context').parameters['directors']} and`;
        textToDisplay_prequel += `Director(s) ${conv.contexts.get('vote_context').parameters['directors']}.\n`;
      }
      if (conv.contexts.get('vote_context').parameters['imdb_rating'] !== null && conv.contexts.get('vote_context').parameters['imdb_rating'] !== 'undefined') {
        textToSpeech_prequel += ` it currently has an IMDB rating of ${conv.contexts.get('vote_context').parameters['imdb_rating']} out of 10. <break time="0.35s" /> `;
        textToDisplay_prequel += `IMDB rating: ${conv.contexts.get('vote_context').parameters['imdb_rating']}/10. \n`;
      }
      if (conv.contexts.get('vote_context').parameters['actors'] !== null && conv.contexts.get('vote_context').parameters['actors'] !== 'undefined') {
        textToSpeech_prequel += ` The cast of ${movie_title} is primarily comprised of ${conv.contexts.get('vote_context').parameters['actors']}. <break time="0.25s" /> `;
        textToDisplay_prequel += `Cast: ${conv.contexts.get('vote_context').parameters['actors']}.\n`;
      }
      textToSpeech_prequel += `</speak>`;

      const textToSpeech = `<speak>` +
        `Warning! ${movie_title} plot spoilers! <break time="0.75s" /> ` +
        `${movie_plot} <break time="1.5s" /> ` +
        `So, would you watch ${movie_title}? <break time="0.35s" /> ` +
        `</speak>`;

      const textToDisplay = `⚠️ Warning! "${movie_title}" plot spoilers! 🙉 \n\n` +
        `"${movie_plot}"`;

      store_repeat_response(conv, 'moreMovieInfo', textToSpeech, textToDisplay); // Storing repeat info

      chatbase_analytics(
        conv,
        `Showed user ${movie_title} (${movie_imdb_id})`, // input_message
        'moreMovieInfo', // input_intent
        'Win' // win_or_fail
      );

      conv.ask(
        new SimpleResponse({
          speech: textToSpeech_prequel,
          text: textToDisplay_prequel
        }),
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions(suggestions)
        );
      }
    } else {
      /*
      No mode is present (shouldn't occur)
      */
      return catch_error(conv, 'No "mode" detected!', 'moreMovieInfo');
    }
  } else {
    /*
    The 'vote_context' context is not present.
    */
    //return catch_error(conv, 'No "vote_context" detected!', 'moreMovieInfo');
    return handle_no_contexts(conv, 'moreMovieInfo');
  }
});

app.intent('goat', (conv, { movieGenre }) => {
  /*
  Displaying the most upvoted movies to the user.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // For fallback handling

  var movie_genres_string; // Declaring before promise
  var movie_genres_comma_separated_string; // Declaring before promise

  return parse_parameter_list(movieGenre, ',')
  .then(parsed_movieGenre_string => {

    movie_genres_string = parsed_movieGenre_string;
    conv.user.storage.movieGenre = parsed_movieGenre_string;
    return parse_parameter_list(movieGenre, ', verbose')
    .then(parsed_movieGenre_comma_separated_string => {

      movie_genres_comma_separated_string = parsed_movieGenre_comma_separated_string;

      //const allowed_vote_targets = ['goat_upvotes', 'goat_downvotes', 'total_goat_votes', 'sigir_upvotes', 'sigir_downvotes', 'total_sigir_votes', 'imdbVotes']; // Allowed GOAT vote targets

      const qs_input = {
        //  HUG REST GET request parameters
        genres: movie_genres_string, // Anonymous google id
        vote_target: 'goat_upvotes',
        api_key: 'HUG_REST_API_KEY'
      };

      return hug_request('HUG', 'get_goat_movies', 'GET', qs_input)
      .then(body => {
        if (body.success === true && body.valid_key === true && body.hasOwnProperty('goat_movies')) {
          // Successfully retrieved 'GOAT' movies
          if (body.goat_movies.length > 0) {
            // Verifying that we've actually got movies to display
            let movie_title_length_limit;
            //let goat_text = ``;
            let textToSpeech = ``;
            let textToDisplay = ``;
            let goat_voice = ``;

            if (movieGenre.length > 0) {
              /*
              We need to account for the length of the genres in the SSML.
              Otherwise, validation will fail!
              body.length === quantity of movies returned in GOAT list!
              */
              movie_title_length_limit = Math.floor((640 - 72 - movie_genres_comma_separated_string.length)/body.goat_movies.length);
            } else {
              /*
              No genres input, increase the title length limit!
              */
              movie_title_length_limit = Math.floor((640 - 72)/body.goat_movies.length)
            }

            if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
              // TODO: Maske use of table cards to display this information once it's no longer in developer preview
              let sum_movie_title_lengths; // let to hold summed length of movie titles
              let goat_text = ``;

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

              var goat_movies_list; // Temp variable

              return goat_rows(body)
              .then(goat_rows_list => {
                // Setting the variable above
                goat_movies_list = goat_rows_list;
                return goat_rows_list;
              })
              .then(goat_rows_list => {
                //console.log(`goat rows 2: ${goat_rows_list}`);
                if (movie_genres_comma_separated_string.length > 2 && movie_genres_comma_separated_string !== "NONE") {
                  // The user provided genre parameters
                  // >2 because no movie genres is ` `
                  textToSpeech = `<speak>` +
                                   `The greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                    goat_voice +
                                 `</speak>`;
                  textToDisplay = `The 'greatest ${movie_genres_comma_separated_string} movies of all time', as determined by our userbase are:\n\n${goat_text}`;
                } else {
                  // The user didn't provide genre parameters
                  textToSpeech = `<speak>` +
                                   `The greatest movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                    goat_voice +
                                 `</speak>`;
                  textToDisplay = `The 'greatest movies of all time', as determined by our userbase are:\n\n${goat_text}`;
                }
                return goat_rows_list;
              })
              .then(goat_rows_list => {
                /*
                // The user has a screen, let's show them a card with some 'pro tips'
                let pro_tips = `These GOAT results are dynamically generated by our active userbase's movie rankings. ` +
                                 `You can specify multiple genres to view different GOAT results ` +
                                 `(E.g "greatest scary funny movies of all time)."` +
                                 `Try looking for these movies on YouTube or the Google Play Movie store.`;


                new BasicCard({
                  title: `🐐 GOAT (Greatest Of All Time) Movie Tips!`,
                  text: pro_tips,
                  display: 'WHITE'
                }),
                */
                chatbase_analytics(
                  conv,
                  `GOAT ${movie_genres_comma_separated_string} movies!`, // input_message
                  'goat', // input_intent
                  'Win' // win_or_fail
                );
                let subtitle;
                if (movie_genres_comma_separated_string !== "NONE") {
                  subtitle = `Greatest ${movie_genres_comma_separated_string} movies of all time!`;
                } else {
                  subtitle = `Greatest movies of all time!`;
                }

                conv.ask(
                  new SimpleResponse({
                    speech: textToSpeech,
                    text: textToDisplay
                  }),
                  new Table({
                    title: 'GOAT Movies',
                    subtitle: subtitle,
                    dividers: true,
                    columns: ['Title', 'IMDB Rating', 'GOAT Ranking'],
                    rows: goat_movies_list
                  }),
                  new SimpleResponse({
                    speech: '<speak>What do you want to do next?</speak>',
                    text: 'What do you want to do next?'
                  }),
                  new Suggestions('💾 SIGIR demo',  '🎥 SIGIR Movies', '🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
                );
                store_repeat_response(conv, 'getGoat', textToSpeech, textToDisplay); // Storing repeat info
              });

            } else {
              /*
                The user doesn't have a screen!
                Best practice is to only present 3 list results, not 10.
                We aught to provide some sort of paging to
              */
              if (movie_genres_comma_separated_string !== `` && movie_genres_comma_separated_string !== 'NONE') { // TODO: Check if the function returns '' or ' '!
                textToSpeech = `<speak>The 3 greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are: <break time="0.35s" />`;
                textToDisplay = `The 3 greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are:`;
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
                `GOAT ${movie_genres_comma_separated_string} movies! No screen!`, // input_message
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
            // This should never trigger, but better safer than sorry!
            return catch_error(conv, 'Unexpected error!', 'GOAT');
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
      .catch(error_message => {
        return catch_error(conv, error_message, 'progress_notification');
      });

    });
  });
});

app.intent('getLeaderBoards', conv => {
  /*
    We want to gamify the bot, so that we encourage people to vote as much as possible.
    The more voting data we have, the better recommendations we can provide to everyone!
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
  ];
  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendations', '📑 Help', '🚪 quit'];
  store_fallback_response(conv, fallback_messages, suggestions);

  const qs_input = {
    //  HUG REST GET request parameters
    gg_id:  parse_userId(conv), // Anonymous google id
    api_key: 'HUG_REST_API_KEY'
  };

  return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
  .then(body => {
    if (body.success === true && body.valid_key === true) {

      let textToSpeech;
      let textToDisplay;

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

      store_repeat_response(conv, 'getLeaderboard', textToSpeech, textToDisplay); // Storing repeat info

      conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      chatbase_analytics(
        conv,
        `Displayed leaderboard`, // input_message
        'getLeaderboard', // input_intent
        'Win' // win_or_fail
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT') && body.total_movie_votes > 0) {
        conv.ask(
          new BasicCard({
            title: `You're rank ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users!`,
            text: `🗳 Keep ranking movies to improve your leaderboard position! Note that 30 days of inactivity will wipe your statistics!`,
            display: 'WHITE'
          })
        );
      }

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendations', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', '🚪 quit')
        );
      }

    } else if (body.success === false && body.valid_key === true) {
      /*
        This shouldn't occur unless an invalid gg_id was provided.
        Rather than crash out, let's tell them they're new 👍
      */
      const textToSpeech = `<speak>` +
        `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
        `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> ` +
        `</speak>`;

      const textToDisplay = `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
        `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> `;

      store_repeat_response(conv, 'getLeaderboard_fail', textToSpeech, textToDisplay); // Storing repeat info

      conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: textToSpeech,
          text: textToDisplay
        })
      );
      chatbase_analytics(
        conv,
        `failed to display leaderboard`, // input_message
        'getLeaderboard_fail', // input_intent
        'fail' // win_or_fail
      );
      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendations', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', '🚪 quit')
        );
      }
    } else {
      // Something is wrong with hug
      return catch_error(conv, 'Unexpected error!', 'getLeaderBoards');
    }

  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
});

app.intent('recommend_movie', (conv, { movieGenre }) => {
  /*
  Movie recommendation intent.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  return setup_experiment (conv, 'recommend_movie', movieGenre)
  .then(experiment_body => {
    /*
    Example body:
    {
      'experiment_id': 5,
      'target_hug_parameters': {key: val},
      'target_hug_function': 'get_random_movie_list',
      'outcome': 1
    };
    */

    return hug_request('HUG', experiment_body.target_hug_function, 'GET', experiment_body.target_hug_parameters)
    .then(rec_body => {
      if (rec_body.success === true && rec_body.valid_key === true) {
        const quantity_top_k = rec_body.movies.length;

        if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
          /*
            The user has a screen, let's show the carousel & suggestions
          */
          if (quantity_top_k >= 3) {
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
    .catch(error_message => {
      return catch_error(conv, error_message, 'recommendation');
    });
  }) // END of the GET request!
  .catch(error_message => {
    return catch_error(conv, error_message, 'recommendation');
  });
});

function no_movies_found (conv) {
  /*
    Inform the user that there are no movies to display - better than kicking them out of the bot!
  */
  const textToSpeech = `<speak>Sorry, I couldn't find any such movies. What do you want to do next?</speak>`;
  const textToDisplay = `Sorry, I couldn't find any such movies. What do you want to do next?`;
  const fallback_messages = ["Pardon? What next?", "I didn't catch that, what do you want do to next?"];
  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation',  '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestions);
  store_repeat_response(conv, 'no_movies_found', textToSpeech, textToDisplay); // Storing repeat info
  chatbase_analytics(
    conv,
    `movie_recommendation: no movies found!`, // input_message
    'recommend_movie', // input_intent
    'fail' // win_or_fail
  );

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    // User has a screen
    return conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      }),
      new Suggestions(suggestions)
    );
  } else {
    // No screen
    return conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay // But then who was display?
      })
    );
  }
}

app.intent('dislike.all.recommendations', (conv) => {
  /*
  Erasing the contexts then sending users to training mode!
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

  //console.log("USER Disliked all recommendations!");
  if (typeof(conv.contexts.get('list_body')) !== "undefined") {

    let iterator_max;

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      // Showing devices with a screen 10 items
      iterator_max = 9;
    } else {
      // For speakers, skipping submitting bad ratings to movies 3-9 (not displayed to them).
      iterator_max = 2;
    }

    let movie_list = [];

    for (let iterator = 0; iterator < iterator_max; iterator++) {
      // Iterating over the top k body results!
      let string_iterator = iterator.toString();
      let movie_id = conv.contexts.get('list_body').parameters[string_iterator].imdbID;
      movie_list.push(movie_id);
    }

    let textToSpeech;
    let textToDisplay;

    const option = {
      gg_id: parse_userId(conv), // Anonymous google id
      movie_ids: movie_list.join(),
      conv_id: conv.id, // string! not a number
      raw_vote: (conv.input.raw).toString(),
      sigir: (conv.user.storage).hasOwnProperty('sigir') | 0,
      api_key: 'HUG_REST_API_KEY'
    };

    return hug_request('HUG', 'downvote_many_movies', 'GET', option)
    .then(() => {
      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        // Device has a screen
        textToSpeech = `<speak>` +
          `Sorry for providing poor movie recommendations. <break time="0.25s" /> ` +
          `Please try ranking more movies to improve future recommendations. <break time="0.5s" /> ` +
          `What do you want to do next? Rank movies, view your stats, get help or quit?` +
          `</speak>`;
        textToDisplay = `Sorry for providing poor movie recommendations. \n\n` +
          `Please try ranking more movies to improve future recommendations. \n\n` +
          `What do you want to do next? Rank movies, view your stats, get help or quit?`;
      } else {
        // Device is speaker only
        textToSpeech = `<speak>` +
          `Sorry for providing poor movie recommendations. <break time="0.25s" /> ` +
          `Please try ranking more movies to improve future recommendations. <break time="0.5s" /> ` +
          `What do you want to do next? Rank movies, view your stats, get help or quit?` +
          `</speak>`;
        textToDisplay = `Sorry for providing poor movie recommendations.` +
          `Please try ranking more movies to improve future recommendations.` +
          `What do you want to do next? Rank movies, view your stats or quit?`;
      }

      store_repeat_response(conv, 'dislikeRecommendations', textToSpeech, textToDisplay); // Storing repeat info

      chatbase_analytics(
        conv,
        `User downvoted all recommended movies!`, // input_message
        'dislike.all.recommendations', // input_intent
        'Fail' // win_or_fail
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        return conv.ask(
          new SimpleResponse({
            // Sending the details to the user
            speech: textToSpeech,
            text: textToDisplay
          }),
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation',  '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`)
        );
      } else {
        return conv.ask(
          new SimpleResponse({
            // Sending the details to the user
            speech: textToSpeech,
            text: textToDisplay
          })
        );
      }
    })
    .catch(error_message => {
      return catch_error(conv, error_message, 'dislike_all_submit_movie_rating');
    });
  } else {
    // This shouldn't trigger, but better safer than sorry!
    //return catch_error(conv, 'No voting contexts !', 'voted');
    return handle_no_contexts(conv, 'dislike.all.movies');
  }
});

app.intent('item.selected', (conv, input, option) => {
  /*
  Helper for carousel - reacting to item selection.
  Related: https://developers.google.com/actions/assistant/helpers#getting_the_results_of_the_helper_1
  Get & compare the user's selections to each of the item's keys
  The param is set to the index when looping over the results to create the addItems contents.
  */
  if (conv.contexts.get('list_body', '0')) {
    //console.log("INSIDE: itemSelected");
    let movie_element; // Where we'll store the JSON details of the clicked item!

    conv.data.fallbackCount = 0; // Required for tracking fallback attempts!
    const possible_parameters = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    if (possible_parameters.includes(option)) {
      // Extract the contents of the selected movie from the 'list_body' context.
      movie_element = conv.contexts.get('list_body').parameters[option];
    } else {
      // They somehow clicked on something not in the carousel, abandon ship!
      conv.close('You selected an unknown item from the list or carousel, for safety the bot will quit.');
    }

    return hug_request('HUG', 'log_clicked_item', 'POST', {gg_id: parse_userId(conv), k_mov_ts: movie_element.k_mov_ts, clicked_movie: movie_element.imdbID, api_key: 'HUG_REST_API_KEY'})
    .then(() => {
      //console.log('Successfully posted the clicked item to hug/mongodb!');

      /*
      conv.contexts.set('recommend_movie_context', 0, { // Duration 0 to erase the context!
        "placeholder": "placeholder",
        "repeatedRichResponse": "", // Erasing context!
        "repeatedCarousel": "" // Erasing context!
      });

      conv.contexts.set('item_selected_context', 1, { // Placeholder to initialize/trigger the 'item_selected_context' context.
        "placeholder": "placeholder"
      });
      */

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
        'item.selected', // input_intent
        'Win' // win_or_fail
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        return conv.ask(
          new SimpleResponse({
            // Sending the details to the user
            speech: textToSpeech,
            text: textToDisplay
          }),
          new BasicCard({
            title: `${movie_element.title} (${movie_element.year})`,
            text: `Plot: ${movie_element.plot}`,
            buttons: new Button({
              title: `🍿 Google Play Search`,
              url: `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://play.google.com/store/search?q=${movie_element.title}&c=movies`,
            }),
            image: { // Mostly, you can provide just the raw API objects
              url: `${(movie_element.poster_url).replace("http://", "https://")}`, // NO HTTP ALLOWED!
              accessibilityText: `${movie_element.title}`
            },
            display: 'WHITE'
          }),
          new Suggestions(`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, '🗳 Rank Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '💾 SIGIR demo')
        );
      } else {
        return conv.ask(
          new SimpleResponse({
            // Sending the details to the user
            speech: textToSpeech,
            text: textToDisplay
          })
        );
      }
    }) // END of the GET request!
    .catch(error_message => {
      return catch_error(conv, error_message, 'recommendation');
    });
  } else {
    // Shouldn't happen, but better safe than sorry!
    return handle_no_contexts(conv, 'itemSelected');
  }
}); // end of itemSelected function!

app.intent('recommend_movie.fallback', (conv) => {
  /*
  Fallback function for the voting mechanisms!
  Change the CAROUSEL_FALLBACK contents if you want different responses.
  */
  //console.log("RECOMMEND FALLBACK TRIGGERED!");
  //const recommendation_context = conv.contexts.get('recommend_movie_context');
  var CAROUSEL_FALLBACK_DATA;

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    CAROUSEL_FALLBACK_DATA = [
      "Sorry, which film was that?",
      "I didn't catch that. Could you repeat your movie selection?",
    ];
    if (typeof(conv.contexts.get('recommend_movie_context')) !== "undefined" && typeof(conv.contexts.get('list_body')) !== "undefined") {
      if ((!(conv.data).hasOwnProperty('fallbackCount')) || (typeof(conv.data.fallbackCount) === "undefined")) {
        // Checking that the fallbackcount conv data exists
        conv.data.fallbackCount = 0;
      }

      if (conv.data.fallbackCount >= 2) {
        // The user failed too many times
        chatbase_analytics(
          conv,
          `User failed the movie recommendation fallback & force quit!`, // input_message
          'recommend_movie.fallback', // input_intent
          'Fail' // win_or_fail
        );

        return conv.close("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
      } else {
        /*
          Displaying carousel fallback & forwarding contexts in case of subsequent carousel fallbacks
        */
        const textToSpeech = `<speak>${CAROUSEL_FALLBACK_DATA[conv.data.fallbackCount]}</speak>`;
        const textToDisplay = CAROUSEL_FALLBACK_DATA[conv.data.fallbackCount];

        store_repeat_response(conv, 'listFallback', textToSpeech, textToDisplay); // Storing repeat info

        chatbase_analytics(
          conv,
          `We didn't understand what movie the user wanted to watch! Prompted with fallback!`, // input_message
          'recommend_movie.fallback', // input_intent
          'Fail' // win_or_fail
        );

        conv.data.fallbackCount++; // Iterate the fallback counter

        return conv.ask(
          new SimpleResponse({
            speech: textToSpeech,
            text: textToDisplay
          }),
          new Carousel({
            items: conv.contexts.get('recommend_movie_context').parameters['repeatedCarousel']
          }),
          new Suggestions('🗳 Rank Movies', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`)
        );

      }
    } else {
      /*
       Shouldn't occur, but better safe than sorry!
      */
      return handle_no_contexts(conv, 'recommended_movie_fallback');
    }
  } else {
    // We need to remind users without screens what the movie was
    if ((typeof(conv.data.speaker_title) !== "undefined") && (conv.data).hasOwnProperty('speaker_title')) {
      let speaker_title = conv.data.speaker_title;

      CAROUSEL_FALLBACK_DATA = [
        `Sorry, would you watch "${speaker_title}"?`,
        `I didn't catch that. Would you watch "${speaker_title}"?`
      ];
    } else {
      CAROUSEL_FALLBACK_DATA = [
        `Sorry, are you interested in this movie?`,
        `I didn't catch that. Are you interested in this movie?`
      ];
    }

    if ((!(conv.data).hasOwnProperty('fallbackCount')) || (typeof(conv.data.fallbackCount) === "undefined")) {
      // Checking that the fallbackcount conv data exists
      conv.data.fallbackCount = 0;
    }

    if (conv.data.fallbackCount > 1) {
      // The user 'fellback' too many times
      chatbase_analytics(
        conv,
        `User failed the movie recommendation fallback & force quit!`, // input_message
        'recommend_movie.fallback', // input_intent
        'Fail' // win_or_fail
      );

      return conv.close("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
    } else {
      /*
        Displaying carousel fallback & forwarding contexts in case of subsequent carousel fallbacks
      */
      const textToSpeech = `<speak>${CAROUSEL_FALLBACK_DATA[conv.data.fallbackCount]}</speak>`;
      const textToDisplay = CAROUSEL_FALLBACK_DATA[conv.data.fallbackCount];

      store_repeat_response(conv, 'listFallback', textToSpeech, textToDisplay); // Storing repeat info

      chatbase_analytics(
        conv,
        `We didn't understand what movie the user wanted to watch! Prompted with fallback!`, // input_message
        'recommend_movie.fallback.speaker', // input_intent
        'Fail' // win_or_fail
      );

      conv.data.fallbackCount++; // Iterate the fallback counter

      return conv.ask(
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        })
      );

    }
  }
});

app.intent('getHelpAnywhere', conv => {
  /*
  Provides the user the ability to get help anywhere they are in the bot.
  */
  const help_anywhere_parameter = {}; // The dict which will hold our parameter data
  help_anywhere_parameter['placeholder'] = 'placeholder'; // We need this placeholder
  conv.contexts.set('help_anywhere', 1, help_anywhere_parameter); // We need to insert data into the 'home' context for the home fallback to trigger!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
  ];

  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation',  '💾 SIGIR demo', '🎥 SIGIR Movies',  `🐐 GOAT Movies`, '🏆 Show Stats', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestions);

  chatbase_analytics(
    conv,
    `The user asked for help!`, // input_message
    'getHelpAnywhere', // input_intent
    'Win' // win_or_fail
  );

  const textToSpeech = `<speak>` +
    `I heard you need help using Vote Goat? <break time="0.35s" /> ` +
    `In Vote Goat you can rank movies, get movie recommendations and get lists of most upvoted movies.<break time="0.25s" />` +
    `You can filter movie results by including movie genres during our conversations.<break time="0.25s" />` +
    `When shown a movie, you can ask for "more movie info" or enquire "watch movie online" the movie online.<break time="0.25s" />` +
    `Vote Goat includes a leaderboard system and progression tracker, so keep ranking movies to stay ahead of other users!<break time="0.25s" />` +
    `It's not yet possible to search for movies directly nor yet possible to filter movies other than by genre. This will change in the future.<break time="0.25s" />` +
    `</speak>`;

  const textToDisplay = `I heard you need help using Vote Goat?\n` +
    `◽ In Vote Goat you can rank movies, get movie recommendations and get lists of most upvoted movies.\n` +
    `◽ You can filter movie results by including movie genres in our conversation.\n` +
    `◽ When shown a movie, you can ask for "🎬 more movie info" or enquire where to "🍿 watch the movie online".\n` +
    `◽ Vote Goat includes a leaderboard system and progression tracker, so keep ranking movies!\n` +
    `🔽 It's not yet possible to search for movies directly nor yet possible to filter movies other than by genre. This will likely change in the near future.\n`;

  let textToSpeech2;
  let textToDisplay2;

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    // Device has a screen
    textToSpeech2 = `<speak>` +
      `So, what do you want to try next?` +
      `</speak>`;
    textToDisplay2 = `What do you want to try next?`;
  } else {
    // Device has no screen
    textToSpeech2 = `<speak>` +
      `So, what do you want to try next?<break time="0.35s" /> Rank movies, movie recommendation, or perhaps view greatest movies of all time?` +
      `</speak>`;
    textToDisplay2 = `What do you want to try next? Rank movies, movie recommendation, or perhaps view greatest movies of all time?`;
  }

  /*
    Storing repeat info.
    Only repeating the first section for now!
  */
  store_repeat_response(conv, 'getHelpAnywhere', textToSpeech, textToDisplay);

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

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
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
      new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats', `🚪 Quit`)
    );
  }
});

app.intent('goodbye', conv => {
  /*
  An intent enabling the user to manually quit the bot.
  We can't provide suggestion chips, but button links still work (for outbound survey request on exit).
  */
  const textToSpeech = `<speak>Sorry to see you go, come back soon? <break time="0.35s" />Goodbye.</speak>`;
  const textToDisplay = `Sorry to see you go, come back soon? \n\nGoodbye.`;

  chatbase_analytics(
    conv,
    'The user asked to quit the app!', // input_message
    'Goodbye', // input_intent
    'Win' // win_or_fail
  );

  // Let's clean up the old data:
  erase_storage_data(conv);

  conv.close(
    new SimpleResponse({
      // Sending the details to the user
      speech: textToSpeech,
      text: textToDisplay
    })
  );
});

//////////// BETA:

app.intent('where_to_watch', (conv) => {
  /*
  Browsing carousel with amazon, google play, youtube, etc hyperlinks - enabling our users to consume content we recommend!
  Similar to moreMovieInfo!
  TODO: Dialogflow input movie title/imdbID, not vote contexts.
  */
  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    // Screen
    //if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT') && conv.surface.capabilities.has('actions.capability.WEB_BROWSER')) {
    return where_to_watch_helper(conv);
  } else {
    // No screen
    if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
      if (typeof(conv.contexts.get('vote_context').parameters['mode']) !== 'undefined') {
        const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the title
        conv.close(
          new SimpleResponse({
            speech: `<speak>Sorry, this function requires screen functionality. Please switch device, or try Googling where to watch "${movie_title}".</speak>`,
            //speech: `<speak>Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch "${movie_title}".</speak>`,
            text: `Sorry, this function requires screen functionality. Please switch device, or try Googling where to watch "${movie_title}".`
            //text: 'Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch "${movie_title}".'
          })
        );
      } else {
        conv.close(
          new SimpleResponse({
            speech: '<speak>Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.</speak>',
            text: 'Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.'
          })
        );
      }
    } else {
      conv.close(
        new SimpleResponse({
          speech: '<speak>Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.</speak>',
          text: 'Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.'
        })
      );
    }
  }
});

function where_to_watch_helper (conv) {
  /*
    Produce the 'where to watch' browse carousel!
  */
  if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
    // vote context exists
    if (typeof(conv.contexts.get('vote_context').parameters['mode']) !== 'undefined') {
      // mode exists within vote context
      conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

      //const requested_mode = conv.contexts.get('vote_context').parameters['mode']; // Retrieving the expected voting mode (within a list, or during training)!
      const movie_imdb_id = conv.contexts.get('vote_context').parameters['movie']; // Retrieving the movie we want to downvote!
      const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the title

      const fallback_messages = [
        `Sorry, what was that?`,
        `Sorry, I didn't catch that, what do you want to do next?`
      ];

      var suggestions;

      if (conv.contexts.get('vote_context').parameters['mode'] === 'list_selection') {
        console.log(`DEBUG WATCH LIST SELECTION: ${conv.user.storage.last_intent_name}`);
        if (conv.user.storage.last_intent_name === 'voted') {
          suggestions = ['🗳 Rank Movies', `🤔 recommend me a movie`, '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
        } else {
          suggestions = [`👍`, `👎`, '🗳 Rank Movies',  '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
        }
      } else {
        console.log(`DEBUG WATCH LIST ELSE: ${conv.user.storage.last_intent_name}`);
        suggestions = [`👍`, `👎`, `🤔 recommend me a movie`,  '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
      }

      store_fallback_response(conv, fallback_messages, suggestions);

      /*
      // TODO: Replace with an outbound vote_context 1
      conv.contexts.set('vote_context', 1, { // Specifying the data required to vote!
        "mode": conv.contexts.get('vote_context').parameters['mode'],
        "movie": conv.contexts.get('vote_context').parameters['movie']
      });
      */

      const textToSpeech = `<speak>` +
        `Check out the following links to watch "${movie_title}" online. Availability may differ based on geographical location.` +
        `</speak>`;

      const textToDisplay = `Try a few of the following links, availability of "${movie_title}" may differ depending on geographic location.`;

      store_repeat_response(conv, 'where_to_watch', textToSpeech, textToDisplay); // Storing repeat info

      chatbase_analytics(
        conv,
        `Browse Carousel: ${movie_title} (${movie_imdb_id})`, // input_message
        'where_to_watch', // input_intent
        'Win' // win_or_fail
      );

      conv.ask(
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      const iptv = [
        /*
          List of IPTV records.
          We want to construct outbound carousel items for the user to find the target movie.
          9 max items.
        */
        {
          'title': 'Google Play',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://play.google.com/store/search?q=${movie_title}&c=movies`,
          'img_url': `https://www.gstatic.com/android/market_images/web/play_prism_hlock_2x.png`, //TODO: CHANGE HOTLINK
          'img_alt': `Google Play logo`,
          'description': `Potentially available to rent/buy via the Google Play movie store.`,
          'footer': ``
        },
        {
          'title': 'Netflix',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://www.netflix.com/search?q=${movie_title}`,
          'img_url': `https://i.imgur.com/YblTE8T.png`, // TODO: Not use imgur
          'img_alt': `Netflix logo`,
          'description': `Potentially available via Netflix subscription.`,
          'footer': ``
        },
        {
          'title': 'Justwatch',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://www.justwatch.com/`,
          'img_url': `https://www.justwatch.com/company/assets/JustWatch-icon.png`,
          'img_alt': `Justwatch logo`,
          'description': `Justwatch is an EU funded legal streaming search engine service, saving you time searching!`,
          'footer': ``
        },
        {
          'title': 'GoWatchIt',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://gowatchit.com/search?terms=${movie_title}`,
          'img_url': `https://i.imgur.com/nJc4F4I.png`,
          'img_alt': `GoWatchIt logo`,
          'description': `GoWatchIt (US-only) provides movie search across many services.`,
          'footer': ``
        },
        {
          'title': 'ReelGood',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://reelgood.com/search?q=${movie_title}`,
          'img_url': `https://i.imgur.com/e2gDcVK.png`,
          'img_alt': `ReelGood logo`,
          'description': `Search engine for streaming content.`,
          'footer': ``
        },
        {
          'title': 'Amazon Prime',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://www.amazon.co.uk/s/?url=search-alias%3Dprime-instant-video&field-keywords=${movie_title}`,
          'img_url': `https://m.media-amazon.com/images/G/02/digital/video/New_MLP/Prime_Smile_logo_133x80.png`,
          'img_alt': `Amazon Prime logo`,
          'description': `Potentially available to rent/buy or view for free through Prime subscription.`,
          'footer': ``
        },
        {
          'title': 'Google search',
          'url': `https://chatbase.com/r?api_key=CHATBASE_API_KEY&url=https://www.google.com/search?q=watch+${movie_title}+online`,
          'img_url': `https://i.imgur.com/1hjxlJ5.png`,
          'img_alt': `Google logo`,
          'description': `Perform a google search.`,
          'footer': ``
        }
      ];

      //let movie_list = []; // Where we'll store the list elements
      let carousel_items = []; // Creating carousel item holder

      for (let iterator = 0; iterator < iptv.length; iterator++) { // Iterating over the top k rec_body results!
        if (iterator > 9) {
           // Can't place more than 10 items in the carousel!
          break;
        } else {
          //const index_value = iterator.toString(); // Creating string representation of index for context data

          carousel_items[iterator] = new BrowseCarouselItem({
            'title': iptv[iterator]['title'],
            'url': iptv[iterator]['url'],
            'description': iptv[iterator]['description'],
            'image': new Image({
              'url': iptv[iterator]['img_url'],
              'alt': iptv[iterator]['img_alt'],
            }),
            'footer': iptv[iterator]['footer']
          })
        }
      }

      conv.ask(
        new BrowseCarousel({items: carousel_items}),
        new Suggestions(suggestions)
      );
    } else {
      /*
      No mode is present (shouldn't occur)
      */
      return catch_error(conv, 'No "mode" detected!', 'moreMovieInfo');
    }
  } else {
    /*
    The 'vote_context' context is not present.
    */
    return handle_no_contexts(conv, 'moreMovieInfo');
    //return catch_error(conv, 'No "vote_context" detected!', 'moreMovieInfo');
  }
}

//////////// ALPHA:

app.intent('SIGIR', conv => {
  /*
  This intent is for the SIGIR 2018 event!
  When the user runs this intent they will register as an atendee of SIGIR.
  SIGIR user ratings will be tracked seperately from the GOAT movie lists & user leaderboard.
  */

  conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?"
  ];
  let suggestions;
  let textToSpeech;
  let textToDisplay;

  const current_time = Math.floor(Date.now() / 1000);

  if (current_time >= 1531033200 && current_time < 1531479600) {
    /*
      The user is using Vote Goat during SIGIR 2018
    */
    textToSpeech = `<speak>` +
      `Vote Goat was accepted for a poster demonstration at the SIGIR 2018 conference.<break time="0.35s" />` +
      `You can find us at the "Poster and Demo Reception 2" area on July the 10th (Tuesday), between 15:30 – 17:00, Ballroom (Floor 2).<break time="0.35s" />` +
      `Vote during the SIGIR conference to create this year's SIGIR 'GOAT' movies! <break time="0.35s" />` +
      `So, what next?` +
      `</speak>`;

    textToDisplay = `Vote Goat was accepted for a poster demonstration at the SIGIR 2018 conference.\n` +
                    `You can find us at the "Poster and Demo Reception 2" area on July the 10th (Tuesday), between 15:30 – 17:00, Ballroom (Floor 2).\n` +
                    `Vote during the SIGIR conference to create this year's SIGIR 'GOAT' movies!\n` +
                    `So, what next?`;


    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`];
    conv.user.storage.sigir = 1

  } else if (current_time < 1531033200) {
    /*
      Before the event.
    */
    textToSpeech = `<speak>` +
      `Vote Goat will be demonstrated during SIGIR 2018 in the "Poster and Demo Reception 2" area on July the 10th (Tuesday), 15:30 – 17:00, Ballroom (Floor 2).\n` +
      `Return here between the 8th and 12th of July to be included in SIGIR-only stats tracking!\n` +
      `So, what next?` +
      `</speak>`;

    textToDisplay = ``;

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

  } else if (current_time >= 1531479600) {
    /*
      After the event.
    */
    textToSpeech = `<speak>` +
      `Vote Goat was demonstrated at the SIGIR 2018 conference in Ann Arbor Michigan, U.S.A.\n` +
      `SIGIR-only stats tracking is now closed! Return during SIGIR 2019 to curate next year's SIGIR "GOAT" movies.\n` +
      `So, what next?` +
      `</speak>`;

    textToDisplay = ``;

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', `🎥 SIGIR Movies`, '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
  }

  store_repeat_response(conv, 'SIGIR', textToSpeech, textToDisplay); // Storing repeat info
  store_fallback_response(conv, fallback_messages, suggestions);

  chatbase_analytics(
    conv,
    `User visited sigir intent`, // input_message
    'sigir', // input_intent
    'win' // win_or_fail
  );

  conv.ask(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    conv.ask(
      new BasicCard({
      title: `About: ACM SIGIR 2018`,
      subtitle: `Held in Ann Arbor Michigan, U.S.A. July 8-12 2018.`,
      text: `The 41st International ACM SIGIR Conference on Research and Development in Information Retrieval.`,
      buttons: new Button({
        title: 'SIGIR Homepage ',
        url: `http://sigir.org/sigir2018/`,
      }),
      image: { // Mostly, you can provide just the raw API objects
        url: `https://i.imgur.com/9vg8T29.png`,
        accessibilityText: `SIGIR 2018 logo`
      },
      display: 'WHITE'
      }),
      new Suggestions(suggestions)
    );
  }
});

app.intent('SIGIR_Movies', (conv, { movieGenre }) => {
  /*
  Displaying the most upvoted movies to the user.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // For fallback handling

  const current_time = Math.floor(Date.now() / 1000);

  if (current_time < 1531033200) {
    /*
      Before the event - tell them about it, don't attempt to show any stats!
    */
    const fallback_messages = [
      "Sorry, what do you want to do next?",
      "I didn't catch that. Want to rank movies, get movie recommendations, view your stats or need some help?"
    ];
    const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '💾 SIGIR demo', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

    store_fallback_response(conv, fallback_messages, suggestions);

    const textToSpeech = `<speak>` +
      `The SIGIR 2018 'GOAT' movies will be available from July 8th 2018 onwards, until then there are no movies to show, sorry. <break time="0.35s" />` +
      `What do you want to do instead?` +
      `</speak>`;

    const textToDisplay = `The SIGIR 2018 'GOAT' movies will be available from July 8th 2018 onwards, until then there are no movies to show, sorry.\n What do you want to do instead?`;

    store_repeat_response(conv, 'SIGIR_Movies', textToSpeech, textToDisplay); // Storing repeat info

    conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      })
    );

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      conv.ask(
        new Suggestions(suggestions)
      );
    }
  } else {
    /*
      During/After the event - show the stats!
    */
    var movie_genres_string; // Declaring before promise
    var movie_genres_comma_separated_string; // Declaring before promise

    return parse_parameter_list(movieGenre, ',')
    .then(parsed_movieGenre_string => {
      conv.user.storage.movieGenre = parsed_movieGenre_string;
      movie_genres_string = parsed_movieGenre_string;
      //console.log(`GOAT 1: "${parsed_movieGenre_string}" & "${movie_genres_string}"`);

      return parse_parameter_list(movieGenre, ', verbose')
      .then(parsed_movieGenre_comma_separated_string => {

        movie_genres_comma_separated_string = parsed_movieGenre_comma_separated_string;

        /*
        TODO: Enable the user to change vote_target?
              const allowed_vote_targets = ['goat_upvotes', 'goat_downvotes', 'total_goat_votes', 'sigir_upvotes', 'sigir_downvotes', 'total_sigir_votes', 'imdbVotes']; // Allowed GOAT vote targets
        */

        const qs_input = {
          //  HUG REST GET request parameters
          genres: movie_genres_string,
          vote_target: 'sigir_upvotes',
          api_key: 'HUG_REST_API_KEY'
        };

        return hug_request('HUG', 'get_goat_movies', 'GET', qs_input)
        .then(body => {
          if (body.success === true && body.valid_key === true && body.hasOwnProperty('goat_movies')) {
            if ((body.goat_movies).length > 0) {

              // We've got movies to display!
              let movie_title_length_limit;
              //let goat_text = ``;
              let textToSpeech = ``;
              let textToDisplay = ``;
              let goat_voice = ``;

              if (movieGenre.length > 0) {
                /*
                We need to account for the length of the genres in the SSML.
                Otherwise, validation will fail!
                body.length === quantity of movies returned in GOAT list!
                */
                movie_title_length_limit = Math.floor((640 - 72 - movie_genres_comma_separated_string.length)/body.goat_movies.length);
              } else {
                /*
                No genres input, increase the title length limit!
                */
                movie_title_length_limit = Math.floor((640 - 72)/body.goat_movies.length)
              }


              if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                // TODO: Make use of table cards to display this information once it's no longer in developer preview
                let sum_movie_title_lengths; // let to hold summed length of movie titles
                let goat_text = ``;

                for (let index = 0; index < body.goat_movies.length; index++) {
                  /*
                    Iterate over movies in GOAT list to check max length of movie titles
                  */
                  sum_movie_title_lengths += body.goat_movies[index].title;
                }

                if (body.goat_movies.length == 1) {
                  /*
                    We only got the 1 movie.
                  */
                  goat_text += `1st: "${body.goat_movies[0].title}" (${body.goat_movies[0].year}) \n`;
                  goat_voice += `${body.goat_movies[0].title}. <break time="0.3s" />`;

                } else {
                  /*
                    We retrieved more than 1 movie - time to iterate!
                  */
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
                }

                var goat_movies_list; // Temp variable

                return goat_rows(body)
                .then(goat_rows_list => {
                  // Setting the variable above
                  //console.log(`GOAT rows 1: ${goat_rows_list}`);
                  goat_movies_list = goat_rows_list;
                  return goat_rows_list;
                })
                .then(goat_rows_list => {
                  //console.log(`goat rows 2: ${goat_rows_list}`);

                  let movie_or_movies;
                  let are_or_is;
                  if (body.goat_movies.length == 1) {
                    // Only 1 movie
                    movie_or_movies = 'movie';
                    are_or_is = 'is';
                  } else {
                    // Many movies
                    movie_or_movies = 'movies';
                    are_or_is = 'are';
                  }

                  if (movie_genres_comma_separated_string.length > 2 && movie_genres_comma_separated_string !== "NONE") {
                    // The user provided genre parameters
                    // >2 because no movie genres is ` `
                    textToSpeech = `<speak>` +
                                     `The greatest ${movie_genres_comma_separated_string} ${movie_or_movies} of all time, as determined by SIGIR 2018 attendees ${are_or_is}: <break time="0.35s" /> ` +
                                      goat_voice +
                                   `</speak>`;
                    textToDisplay = `The greatest ${movie_genres_comma_separated_string} ${movie_or_movies} of all time, as determined SIGIR 2018 attendees ${are_or_is}:\n\n${goat_text}`;
                  } else {
                    // The user didn't provide genre parameters
                    textToSpeech = `<speak>` +
                                     `The greatest ${movie_or_movies} of all time, as determined by SIGIR 2018 attendees ${are_or_is}: <break time="0.35s" /> ` +
                                      goat_voice +
                                   `</speak>`;
                    textToDisplay = `The greatest ${movie_or_movies} of all time, as determined by SIGIR 2018 attendees ${are_or_is}:\n\n${goat_text}`;
                  }
                  return goat_rows_list;
                })
                .then(goat_rows_list => {

                  new BasicCard({
                    title: `About`,
                    text: `These movie rankings have been generated by SIGIR 2018 attendees. You can specify multiple genres to view different results! (E.g "SIGIR scary funny movies)."`,
                    display: 'WHITE'
                  }),

                  chatbase_analytics(
                    conv,
                    `SIGIR ${movie_genres_comma_separated_string} movies!`, // input_message
                    'SIGIR_Movies', // input_intent
                    'Win' // win_or_fail
                  );

                  conv.ask(
                    new SimpleResponse({
                      speech: textToSpeech,
                      text: textToDisplay
                    }),
                    new SimpleResponse({
                      speech: '<speak>What do you want to do next?</speak>',
                      text: 'What do you want to do next?'
                    }),
                    new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
                  );
                  store_repeat_response(conv, 'SIGIR_Movies', textToSpeech, textToDisplay); // Storing repeat info
                });

              } else {
                /*
                  The user doesn't have a screen!
                  Best practice is to only present 3 list results, not 10.
                  We aught to provide some sort of paging to
                */
                if ((body.goat_movies).length >= 3) {
                  // We've got 3 movies to talk about
                  if (movie_genres_comma_separated_string !== `` && movie_genres_comma_separated_string !== "NONE") { // TODO: Check if the function returns '' or ' '!
                    textToSpeech = `<speak>The 3 greatest ${movie_genres_comma_separated_string} movies of all time, as determined by SIGIR 2018 attendees are: <break time="0.35s" />`;
                    textToDisplay = `The 3 greatest ${movie_genres_comma_separated_string} movies of all time, as determined by SIGIR 2018 attendees are:`;
                  } else {
                    textToSpeech = `<speak>` +
                      `The 3 greatest movies of all time, as determined by SIGIR 2018 attendees are: <break time="0.35s" />`;
                    textToDisplay = `The 3 greatest movies of all time, as determined by SIGIR 2018 attendees are:`;
                  }

                  textToSpeech += `<say-as interpret-as="ordinal">1</say-as> place is ${body.goat_movies[0].title},<break time="0.1s" /> released in ${body.goat_movies[0].year}. <break time="0.35s" />` +
                  `<say-as interpret-as="ordinal">2</say-as> place is ${body.goat_movies[1].title},<break time="0.1s" /> released in ${body.goat_movies[1].year}. <break time="0.35s" />` +
                  `<say-as interpret-as="ordinal">3</say-as> place is ${body.goat_movies[2].title},<break time="0.1s" /> released in ${body.goat_movies[2].year}. <break time="0.35s" />` +
                  `</speak>`;

                  textToDisplay += `1st place is ${body.goat_movies[0].title}, released in ${body.goat_movies[0].year}.\n` +
                  `2nd place is ${body.goat_movies[1].title}, released in ${body.goat_movies[1].year}.\n` +
                  `3rd place is ${body.goat_movies[2].title}, released in ${body.goat_movies[2].year}.\n`;
                } else if ((body.goat_movies).length >= 1) {
                  // We've only got the 1 movie to talk about
                  if (movie_genres_comma_separated_string !== `` && movie_genres_comma_separated_string !== "NONE") { // TODO: Check if the function returns '' or ' '!
                    textToSpeech = `<speak>The greatest ${movie_genres_comma_separated_string} movie of all time, as determined by SIGIR 2018 attendees is <break time="0.25s" />${body.goat_movies[0].title}`;
                    textToDisplay = `The greatest ${movie_genres_comma_separated_string} movie of all time, as determined by SIGIR 2018 attendees is ${body.goat_movies[0].title}`;
                  } else {
                    textToSpeech = `<speak>` +
                      `The greatest movie of all time, as determined by SIGIR 2018 attendees is <break time="0.25s" /> ${body.goat_movies[0].title}`;
                    textToDisplay = `The greatest movie of all time, as determined by SIGIR 2018 attendees is ${body.goat_movies[0].title}`;
                  }
                } // No need for else - already checked!
                chatbase_analytics(
                  conv,
                  `SIGIR ${movie_genres_comma_separated_string} movies! No screen!`, // input_message
                  'SIGIR_Movies', // input_intent
                  'Win' // win_or_fail
                );

                store_repeat_response(conv, 'SIGIR_Movies', textToSpeech, textToDisplay); // Storing repeat info

                conv.ask(
                  new SimpleResponse({
                    speech: textToSpeech,
                    text: textToDisplay
                  }),
                  new SimpleResponse({
                    speech: `<speak><break time="0.5s" />So, what next?</speak> `,
                    text: `So, what next?`
                  })
                );
              }
            } else {
              // This should never trigger, but better safer than sorry!
              return catch_error(conv, 'No movies to show!', 'SIGIR GOAT');
            }
          } else if (body.success === false && body.valid_key === true) {
            /*
              We've not got movies to display!
              Perhaps this is because the user has entered too many movie genres?
            */
            let apologySpeech;
            let apologyText;
            if (movie_genres_comma_separated_string !== "" && movie_genres_comma_separated_string !== "NONE") {
              apologySpeech = `Sorry, I couldn't find any SIGIR curated movies with the genres ${movie_genres_comma_separated_string} for you.<break time="0.2s" /> Try fewer genres?<break time="0.35s" />`;
              apologyText = `Sorry, I couldn't find any SIGIR curated movies with the genres ${movie_genres_comma_separated_string} for you. Try fewer genres?`;
            } else {
              apologySpeech = `Sorry, I was unable to find any SIGIR movies for you. Visit the 'SIGIR demo' intent to activate SIGIR demo mode and rank some movies to get results here, or simply come back later.<break time="0.35s" /> `;
              apologyText =  `Sorry, I was unable to find any SIGIR movies for you. Visit the 'SIGIR demo' intent to activate SIGIR demo mode and rank some movies to get results here, or simply come back later.`;
              // This should never trigger.. there are earlier checks to prevent this...
            }

            let textToSpeech;
            let textToDisplay;
            if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
              textToSpeech = `<speak>` +
                apologySpeech +
                `What do you want to do next?` +
                `</speak>`;
              textToDisplay = apologyText +
                `What do you want to do next?`;
            } else {
              textToSpeech = `<speak>` +
                apologySpeech +
                `What do you want to do next?<break time="0.25s" /> Rank Movies<break time="0.175s" />, get a Movie Recommendation<break time="0.175s" />, view your stats<break time="0.175s" />, get help<break time="0.175s" /> or quit? <break time="0.25s" />` +
                `</speak>`;
              textToDisplay = apologyText +
                `What do you want to do next? Rank Movies, get a Movie Recommendation, view your stats, get help or quit?`;
            }

            chatbase_analytics(
              conv,
              `Couldn't find any SIGIR movies!`, // input_message
              'SIGIR_Movies', // input_intent
              'Fail' // win_or_fail
            );

            store_repeat_response(conv, 'SIGIR_Movies', textToSpeech, textToDisplay); // Storing repeat info

            conv.ask(
              new SimpleResponse({
                speech: textToSpeech,
                text: textToDisplay
              })
            );

            if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
              // The user has a screen, let's show them suggestion buttons.
              conv.ask(
                new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
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

      });
    });
  }
});

function handle_no_contexts (conv, source_name) {
  /*
  The purpose of this function is to handle situations where a context was required but not present within the user's device. This intent ideally is never called, but was triggered during development of v1 occasionally.
  */
  console.log(`handled_no_contexts: ${source_name}`);
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?"
  ];

  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestions);

  chatbase_analytics(
    conv,
    `HANDLED NO CONTEXTS`, // input_message
    source_name, // input_intent
    'Fail' // win_or_fail
  );

  var textToSpeech;
  var textToDisplay;

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    // Screen
    textToSpeech = `<speak>` +
      `Sorry, our last chat session expired. <break time="0.5s" /> ` +
      `What would you like to do next? <break time="0.25s" /> ` +
      `</speak>`;

    textToDisplay = `Sorry, our last chat session expired.\n What would you like to do next?`;
  } else {
    // No screen
    textToSpeech = `<speak>` +
      `Sorry, our last chat session expired. <break time="0.5s" /> ` +
      `What would you like to do next? <break time="0.25s" /> ` +
      `Rank Movies? <break time="0.25s" /> ` +
      `Get a Movie Recommendation? <break time="0.25s" /> ` +
      `View your stats? <break time="0.25s" /> ` +
      `View the Greated movies of all time? <break time="0.25s" /> ` +
      `Or do you need help? <break time="0.25s" /> ` +
      `</speak>`;

    textToDisplay = `Sorry, our last chat session expired. What would you like to do next?`;
  }

  store_repeat_response(conv, 'handle_no_contexts', textToSpeech, textToDisplay); // Storing repeat info
  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    return conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      }),
      new Suggestions(suggestions)
    );
  } else {
    return conv.ask(
      new SimpleResponse({
        speech: textToSpeech,
        text: textToDisplay
      })
    );
  }
}

app.intent('voted', (conv, { voting }) => {
  /*
  Provides voting functionality.
  */
  if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
    const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the expected voting mode (within a list, or during training)!

    const fallback_messages = [
      `Sorry, what was that?`,
      `Sorry, I didn't catch that, would you watch "${movie_title}"?`,
      `I'm sorry, I didn't understand that. Would you cosider watching "${movie_title}"?`
    ];

    const suggestions = [`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, `🤔 recommend me a movie`,  '💾 SIGIR demo', '🎥 SIGIR Movies', '📑 Help'];

    store_fallback_response(conv, fallback_messages, suggestions);

    return interpret_voting_intention(conv, voting)
    .then(voting_intention => {
      //console.log(conv.contexts.get('vote_context'));
      const qs_input = {
        //  HUG REST GET request parameters
        gg_id: parse_userId(conv), // Anonymous google id
        movie_id: conv.contexts.get('vote_context').parameters['movie'], // Passing the movie ID acquired via context
        rating: voting_intention, // The rating we're setting for the movie we just displayed to the user.
        mode: conv.contexts.get('vote_context').parameters['mode'],
        conv_id: conv.id,
        raw_vote: (conv.input.raw).toString(),
        sigir: (conv.user.storage).hasOwnProperty('sigir') | 0,
        api_key: 'HUG_REST_API_KEY'
      };

      //console.log(util.inspect(conv, false, null)); // DEBUG function!

      return hug_request('HUG', 'submit_movie_rating', 'GET', qs_input)
      .then(body => {
        if (body.valid_key === true) {
          if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
            /*
              Before we proceed, let's check that the user has the 'vote_context' context, indicating this is a valid voting attempt!
            */
            if (conv.contexts.get('vote_context').parameters['mode'] === 'training') {
              /*
              Detect if the user is in the training mode, if so, loop them!
              */
              chatbase_analytics(
                conv,
                `User successfully voted in training!`, // input_message
                'voted_ranking', // input_intent
                'Win' // win_or_fail
              );

              return check_recent_activity(conv, voting_intention)
              .then(progress_response => {
                if (progress_response !== '') {
                  const no_emojis_speech = progress_response.replace(/([\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2694-\u2697]|\uD83E[\uDD10-\uDD5D])/g, '');
                  conv.ask(
                    new SimpleResponse({
                      speech: `<speak>${no_emojis_speech}</speak>`,
                      text: progress_response
                    })
                  );
                }
                return progress_response;
              })
              .then(progress_response => {
                return get_single_unrated_movie(conv, (conv.user.storage.movieGenre).split(',')); // Attempting to loop! Empty genre parameter, will hopefully get the data from contexts.
              });

            } else if (conv.contexts.get('vote_context').parameters['mode'] === 'list_selection') {
              /*
              User voted from within the movie recommendation section.
              We want to provide them an appropriate response & prompt them for the next step.
              */
              let textToSpeech;
              let textToDisplay;

              // TODO: Make the following less verbose? Perhaps based on recent usage levels.

              if (voting_intention === 1) {
                // The user upvoted
                chatbase_analytics(
                  conv,
                  `Successful movie recommendation: ${movie_title}`, // input_message
                  'voted_recommendation', // input_intent
                  'Win' // win_or_fail
                );

                if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT') && conv.surface.capabilities.has('actions.capability.WEB_BROWSER') && conv.user.storage.last_intent_name !== 'where_to_watch') {
                  /*
                    The user has a screen & liked the movie - let's show them where to watch it!
                  */

                  /*
                  conv.ask(
                    new SimpleResponse({
                      speech: `<speak>Cool, want to watch ${movie_title} online?</speak>`,
                      text: `Cool, want to watch ${movie_title} online?`
                    })
                  );
                  */
                  conv.user.storage.last_intent_name = 'voted';
                  return where_to_watch_helper(conv);

                } else {
                  /*
                    The user doesn't have a screen, so let's talk to them.
                  */
                  const success_response = [
                    `Huzzah, a successful movie recommendation! Alright, `,
                    `Great to hear! Now then, `,
                    `Cool, try googling where to watch it. So,`,
                    `Cool, I like it too! So,`
                  ];

                  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                    // Screen
                    textToSpeech = `<speak>${success_response[Math.floor(Math.random() * success_response.length)]} <break time="0.25s" />what next?</speak>`;
                    textToDisplay = `${success_response[Math.floor(Math.random() * success_response.length)]} what next?`;
                  } else {
                    // No screen
                    textToSpeech = `<speak>${success_response[Math.floor(Math.random() * success_response.length)]} <break time="0.25s" /> what next? Rank movies, get another movie recommendation or quit?</speak>`;
                    textToDisplay = `${success_response[Math.floor(Math.random() * success_response.length)]} what do you want to do next? Rank movies, get another movie recommendation or quit?`;
                  }
                }
              } else {
                // The user does not like the movie (Overall downvote)
                // If we kept track of how many times they recently saw this intent then we could reduce text repetition.
                if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                  // Screen
                  textToSpeech = `<speak>` +
                    `Sorry about that. <break time="0.25s" /> ` +
                    `Try ranking more movies to improve your recommendations. <break time="0.5s" /> ` +
                    `What next?` +
                    `</speak>`;
                  textToDisplay = `Sorry about that. \n\n` +
                    `Try ranking more movies to improve your recommendations. \n\n` +
                    `What next?`;
                } else {
                  // No screen
                  textToSpeech = `<speak>` +
                    `Sorry about that. <break time="0.25s" /> ` +
                    `Rank more movies to improve your recommendations. <break time="0.5s" /> ` +
                    `What next? Rank movies, view your stats, get help or quit?` +
                    `</speak>`;
                  textToDisplay = `Sorry about that. \n\n` +
                    `Try ranking more movies to improve future recommendations. \n\n` +
                    `What do you want to do next? Rank movies, view your stats, get help or quit?`;
                }

                chatbase_analytics(
                  conv,
                  `Unsuccessful movie recommendation!`, // input_message
                  'voted_recommendation', // input_intent
                  'Win' // win_or_fail
                );
              }

              store_repeat_response(conv, 'voted', textToSpeech, textToDisplay); // Storing repeat info

              conv.ask(
                new SimpleResponse({
                  speech: textToSpeech,
                  text: textToDisplay
                })
              );

              if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                conv.ask(
                  new Suggestions('🗳 Rank Movies', '🤔 recommend me a movie', '🐐 GOAT Movies', '💾 SIGIR demo', '🎥 SIGIR Movies', '🏆 Show Stats',  '📑 Help', `🚪 Quit`)
                );
              }
            } else {
              console.error('An error was encountered in upvote function');
              return handle_no_contexts(conv, 'voted');
              //return catch_error(conv, 'No voting mode detected!', 'voting intent');
            }
          } else {
            /*
              Shouldn't trigger - the user didn't have the 'voting_context' context!
              TODO: Rather than prompt an error, attempt to recover voting_context from user.storage, or use handle_no_contexts function!
            */
            console.log('Voting intent error: No voting_context context present!');
            return handle_no_contexts(conv, 'voted');
            //return catch_error(conv, 'No voting mode detected!', 'voting intent');
          }
        } else {
          // This will only trigger if the API key changes.
          // Better than an unhandled crash!
          return catch_error(conv, 'Invalid Hug API KEY!', 'voting intent');
        }
      })
      .catch(error_message => {
        return catch_error(conv, error_message, 'voted_submit_movie_rating');
      });
    })
    .catch(() => {
      // We didn't hear any valid input from the user!
      console.log("Invalid vote detected! Sent to fallback!");
      return genericFallback(conv, `voted`);
    });
  } else {
    // No 'vote_cotext' context detected
    return handle_no_contexts(conv, 'voted');
  }
});

app.intent('repeat', conv => {
  /*
    Google tips:
    Create a repeat intent that listens for prompts to repeat from the user like "what?", "say that again", or "can you repeat that?".
    In the repeat intent handler, call ask() with a concatenated string of the repeat prefix and the value of conv.data.lastPrompt.
    Keep in mind that you'll have to shift any ssml opening tags if used in the last prompt.
    https://developers.google.com/actions/assistant/best-practices#let_users_replay_information
  */

  if ((!(conv.data).hasOwnProperty('last_intent_name')) || (typeof(conv.data.last_intent_name) === "undefined") || (typeof(conv.data.last_intent_prompt_speech) === "undefined") || (typeof(conv.data.last_intent_prompt_text) === "undefined")) {
    /*
      The user has requested that we repeat ourselves, but their last conversation has expired.
      Let's redirect them to the handle_no_contexts function.
    */
    return handle_no_contexts(conv, 'repeat');
  } else {
    /*
      We've got an ongoing conversation & conv data to work with.
      Let's repeat what we just said! 👍
    */
    const textToSpeech = conv.data.last_intent_prompt_speech; // The last speech bubble
    const textToDisplay = conv.data.last_intent_prompt_text; // The last text displayed
    const intent_name = conv.data.last_intent_name; // The last intent the user was at

    let suggestions;
    if ((conv.data).hasOwnProperty('suggestions')) {
      // There were suggestions stored in conv data.
      suggestions = (conv.data.suggestions).split(', ');
    } else {
      suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '💾 SIGIR demo', '🎥 SIGIR Movies', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
    }

    if (intent_name === 'recommendMovie') {
      // Rather than confuse things, let's just send the use onwards to the movie recommendation fallback.
      chatbase_analytics(conv, `User requested repeat!`, `repeat.carousel`, 'Fail');
      return genericFallback(conv, 'repeat');
    }

    if (typeof(conv.data.fallbackCount) === "undefined") {
      // The fallback counter didn't exist
      conv.data.fallbackCount = 0;
    } else {
      // The fallback counter exists
      const temp_count = conv.data.fallbackCount;
      if (temp_count >= 2) {
        // Quit like normal fallbacks
        conv.close(`Sorry that I couldn't articulate myself, try again later!`);
      } else {
        // Iterate & move on
        conv.data.fallbackCount = temp_count + 1;
      }
    }

    if ((textToSpeech !== null) && (textToDisplay !== null) && (suggestions !== null) && (intent_name !== null)) {
      // The required context data exists
      const repeat_responses = [
        `Sorry, I said`,
        `Let me repeat that`,
        `No worries, i'll repeat myself.`,
        `Sure, I said`,
        `I'll repeat that`
      ];

      const chosen_repeat_response = repeat_responses[Math.floor(Math.random() * repeat_responses.length)];

      conv.ask(
        // We don't need anything other than simple response, as screen devices can simply scroll up to see past content.
        new SimpleResponse({
          // Sending the details to the user
          speech: `<speak>${chosen_repeat_response}</speak>`,
          text: chosen_repeat_response
        })
      );

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions(suggestions)
        );
      }

      conv.ask(
        // We don't need anything other than simple response, as screen devices can simply scroll up to see past content.
        new SimpleResponse({
          // Sending the details to the user
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      chatbase_analytics(conv, `User requested repeat!`, `repeat`, 'Win');
    } else {
      // Failed to repeat response
      return handle_no_contexts(conv, 'itemSelected');
      //return catch_error(conv, 'No stored repeat response!', 'Repeat_Error');
    }
  }
});

//////////// Fallback Intents

/*
  The following redirect the intent specific fallbacks to the 'input.unknown' intent.
*/

app.intent('Welcome.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'Welcome.fallback');
});
app.intent('dislike.all.recommendations.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'dislike.all.recommendations.fallback');
});
app.intent('getHelpAnywhere.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'getHelpAnywhere.fallback');
});
app.intent('getLeaderBoards.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'getLeaderBoards.fallback');
});
app.intent('goat.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'goat.fallback');
});
app.intent('moreMovieInfo.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'moreMovieInfo.fallback');
});
app.intent('Training.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'Training.fallback');
});
app.intent('voted.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'voted.fallback');
});
app.intent('ItemSelected.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'ItemSelected.fallback');
});
app.intent('where_to_watch.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'where_to_watch.fallback');
});
app.intent('SIGIR.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'SIGIR.fallback');
});
app.intent('SIGIR_Movies.fallback', conv => {
  chatbase_analytics(conv, `Handled user fallback prompt!`, `input.unknown.${conv.user.storage.last_intent_name}`, 'Fail');
  return genericFallback(conv, 'SIGIR_Movies.fallback');
});

app.intent('input.unknown', conv => {
  /*
  Generic fallback intent used by all intents!
  */
  chatbase_analytics(
    conv,
    `Handled user fallback prompt!`, // input_message
    `input.unknown.${conv.user.storage.last_intent_name}`, // input_intent
    'Fail' // win_or_fail
  );

  return genericFallback(conv, `input.unknown`);
});

app.catch((conv, error_message) => {
  /*
    Generic error catch
  */
  console.error(error_message);
  return catch_error(conv, error_message, 'Generic_Error');
});

exports.VoteGoat = functions.https.onRequest(app);
