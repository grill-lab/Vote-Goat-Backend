'use strict'; // Mandatory js style?

// Requirements & Global vars:

const { dialogflow, Suggestions, BasicCard, Button, Carousel, Table, Image, SimpleResponse, BrowseCarousel, BrowseCarouselItem} = require('actions-on-google');
const functions = require('firebase-functions'); // Mandatory when using firebase
const requestLib = require('request'); // Used for querying the HUG.REST API
//const util = require('util'); // Used for debugging conv

let chatbase = require('@google/chatbase')
              .setApiKey('CHATBASE_API_KEY') // Your Chatbase API Key
              .setPlatform('Google Assistant'); // The type of message you are sending to chatbase: user (user) or agent (bot)

//const hug_host = 'https://prod.domain.tld'; // THIS IS THE PRODUCTION SERVER! CHANGE WHEN RUNNING STAGING TESTS!
const hug_host = 'https://staging.domain.tld';

const app = dialogflow({
  debug: true
}); // Creating the primary dialogflow app element

////////////// Helper functions

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
        console.log(msg.getCreateResponse());
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
        console.log(msg.getCreateResponse());
        resolve("Success");
      })
    	.catch(err => {
        console.error(err);
        reject("Failure");
      });
    }
  });
}

function forward_contexts (conv, intent_name, inbound_context_name, outbound_context_name) {
  /*
    A function for easily forwarding the contents of contexts!
    Why? Helper intents help direct conversations & need to forwards the user to the corrent intended intent after error handling!
    Which intents? Voting, Repeat, Carousel? Several -> Keep it general!
  */

  return new Promise((resolve, reject) => {
    // Do async job
    console.log(`forward_context pre triggered! ${conv.contexts.get(inbound_context_name).parameters}`);
    if (typeof(conv.contexts.get(inbound_context_name)) !== "undefined") {
      /*
        The inbound context exists.
        Let's forwards it on!
      */
      console.log(`Forwarded contexts! Inbound: '${inbound_context_name}', Outbound: '${outbound_context_name}. CONTENTS BEFORE: ${conv.contexts.get(inbound_context_name).parameters}'`);
      conv.contexts.set(outbound_context_name, 1, conv.contexts.get(inbound_context_name).parameters);
      console.log(`CONTENTS AFTERWARDS FORWARD: ${conv.contexts.get(outbound_context_name).parameters}`);
      resolve('Success!');
    } else {
      /*
        We tried to forward the contents of a context which did not exist.
      */
      console.error(`ERROR: Failed to forwards the inbound context named "${inbound_context_name}"`);
      reject('Failure');
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
  //console.log(`Stored fallback suggestion string: "${parse_parameter_list(suggestions, ',')}"`);
  return parse_parameter_list(suggestions, ', short')
  .then(movie_genres_string => {
    conv.data.suggestions = movie_genres_string;
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
        'Great to hear!',
        'Me too!',
        'I like it too!',
        'Nice one!',
        'Bravo!',
        'Awesome!',
        'Fantastic!',
        'Great taste!', // Perhaps not fair to apply to only upvotes?
        'You are killing it!',
        `You've got it in the bag!`,
        'You are a rockstar!', // Not so for disliking movies? :P
        'You are so amazing!',
        'Way to go!',
        'You are the best!',
        'Yay!'
      ];

      const downvote = [
        'Hmm, that`s a shame.',
        'Sorry about that!',
        'Yeah, I get what you mean.',
        'Me neither!',
        `I don't like it either!`,
        'Fair Enough!',
        'Shoot..!'
      ];

      const encourage_progress = [
        "Keep it up!",
        "Keep on voting!",
        "You got this!",
        'Keep ranking movies!',
        'Keep it going!'
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
              const  movie_leaderboard_ranking = body.movie_leaderboard_ranking; // The user's ranking
              //const  quantity_users = body.quantity_users;

              const possible_leaderboard_notifications = [
                `You're now ${movie_leaderboard_ranking} in Vote Goat leaderboards! Keep on voting!`,
                `Wow, you've voted ${total_movie_votes} times, you sure know your movies!`,
                `Incredible! You've ranked ${total_movie_votes} movies, keep it up!`,
                `You're a Star! You've achieved position ${movie_leaderboard_ranking}. Keep winning!`,
                `That's a job well done!, You ranked ${total_movie_votes} movies. You are almost there!`,
                `You're the best! You've ranked ${total_movie_votes} movies`
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

////////////// UserId related:

function lookup_user_id (conv) {
  /*
    Function to retrieve user Id cleanly.
    Overly elaborate, could be simplified.
  */
  const retrieved_user_id = conv.user.id;

  if (typeof retrieved_user_id !== 'undefined' && retrieved_user_id) {
    /*
      This should always trigger, unless an issue occurs with the Google Assistant itself..
    */
    return retrieved_user_id
  } else {
    /*
      Should never occur!
      Perhaps throw an error?
    */
    return 'INVALID';
  }
}

function isIdValid (conv) {
  /*
    The vast majority of userIds logged had length 86-87 characters
    Approx 10% of userIds logged had length of 13 characters.
    We're assuming that >= 80 is valid, however since this is a random identifier this check may need to change in the future!
  */
  const retrieved_user_id = lookup_user_id(conv);

  if (retrieved_user_id.length >= 80) {
    return true;
  } else {

    if (!conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      // This is a speaker!
      // We could check if speakers are the cause of 13 char long userId.
      console.log(`isIdValid: UserID length < 80 (${retrieved_user_id.length}) & audio-only device!`);
    }
    return false;
  }
}

function register_userId (conv, user_id_string) {
  /*
    Registering an input UserId in MongoDB
    Doesn't return anything, it just does its' thing.
  */
  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: user_id_string, // Anon Google ID from above
    user_name: 'none_supplied', // TODO: REMOVE THIS LINE - Needs a change in both HUG and MongoDB.
    api_key: 'HUG_REST_API_KEY'
  };

  return hug_request('HUG', 'create_user', 'GET', qs_input)
  .then(body => {
    const user_existed = body.user_existed;
    const created_user = body.created_user;

    if (user_existed === false && created_user === true) {
      /*
        UserId successfully registered on MongoDB
      */
      console.log("Account created!");
    } else if (user_existed === true && created_user === false) {
      /*
        The UserId was unseen on the mobile device, but already registered on MongoDB.
        Possible that the user wiped their user storage whilst maintaining their UserId.
      */
      console.log("Account already existed!");
    }
  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'user_registration');
  });
}

function parse_userId (conv) {
  /*
    Purpose of this function is to temporarily store the user's userIds in the user's local storage.
    This can help us track how frequently it changes, and to significantly reduce attempted userId registration attempts.
    User storage is wiped upon crash, so this is not a long term solution.
    https://developers.google.com/actions/identity/user-info
  */
  var retrieved_id_storage = conv.user.storage.useridstorage; // TODO: Verify this storage works!
  var user_gg_id = lookup_user_id(conv);

  if (isIdValid(conv) === true) {

    if (typeof retrieved_id_storage !== 'undefined' && retrieved_id_storage) {
      /*
        The UserId storage object exists, let's check its contents!
      */
      var temp_id_check = false; // Set before the loop
      var iteration_count = 0; // Keeping track of how many iterations were performed

      for (var iterator = 1; iterator <= retrieved_id_storage.length; iterator++) {
        // Loop over each
        iteration_count++;
        const iterator_string = iterator.toString();
        if (retrieved_id_storage['user_' + iterator_string] === user_gg_id) {
          // The UserId was previously stored in user storage
          temp_id_check = true;
          break;
        }
      }

      if (temp_id_check === true) {
        /*
          UserId is already present, return the id without performing registration
        */
        return user_gg_id;
      } else {
        /*
          The UserId is valid & was unseen in the above loo -> we need to register it.
          Once registered, return the UserId.
        */
        register_userId(conv, user_gg_id);
        iteration_count++; // We want to target the next value!
        const target_user_string = 'user_' + iteration_count.toString(); // 'user_#' //TODO: Verify that this works, may need to split into 2 lines!
        retrieved_id_storage[target_user_string] = user_gg_id; // Storing the newest UserId
        return user_gg_id; // Use the latest!
      }

    } else {
      /*
        The UserId storage did not exist.
        Register user & store data locally!
      */
      var retrieved_id = lookup_user_id(conv);
      conv.user.storage.useridstorage_user_1 = retrieved_id;
      //retrieved_id_storage.user_1 = user_gg_id;
      register_userId(conv, retrieved_id);
      return retrieved_id; // Return the user's id
    }
  } else {
    /*
      UserId is INVALID! (Q: The anon UserId is random, so too its length?)
      ---
      Checking the local user storage for the existence of a past valid UserId!
      If present, we'll use it - enabling guests to use our bot yet still contribute towards the host's leaderboard rankings.
    */
    if (typeof retrieved_id_storage.user_1 !== 'undefined' && retrieved_id_storage.user_1) {
      /*
        The user_1 object exists, let's return it!
        TODO: Must verify whether or not local user storage can be manipulated by the user!
      */
      return retrieved_id_storage.user_1;
    } else {
      /*
        The user has an invalid UserId & they also do not have a previously stored UserId!
        What do we do with them?
        TODO: Figure out how to respond to this type of user? Kick them out? Just return the invalid Id & let them carry on as usual? hmm..
        TODO: Prompt for more permissions? Can we re-prompt their personalization setting selection?
      */
      if (typeof retrieved_id_storage.unknown_1 !== 'undefined' && retrieved_id_storage.unknown_1) {
        /*
          A past unknown id was already registered, let's return that instead!
          TODO: Compare current unknown UserId & the stored unknown UserId for greater validity?
        */
        return retrieved_id_storage.unknown_1;
      } else {
        /*
          This occurrence of an unknown id, register it & store it in the local storage.
        */

        retrieved_id_storage.unknown_1 = user_gg_id;
        register_userId(conv, user_gg_id);
        return user_gg_id;
      }
    }
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
        console.log(`PPL: commas & multiple genres! ${movie_genres_string}`)
        resolve(movie_genres_string);
      } else if (separator === ', short' && input_dialogflow_parameter.length > 1) { // More than one genre? Engage!
        // For displaying a comma separated string to the user
        movie_genres_string = (input_dialogflow_parameter.join(', ')); // Merge into a string, optimize gramar.
        resolve(movie_genres_string);
      } else if (separator === ' ' && input_dialogflow_parameter.length > 1) {
        /*
          For use in HUG REST query - returns a space separated string of input genres.
        */
        movie_genres_string = input_dialogflow_parameter.join(separator); // Merge into a string for GET request
        console.log(`PPL: space & multiple genres! ${movie_genres_string}`)
        resolve(movie_genres_string);
      } else if (input_dialogflow_parameter.length === 1) {
        // Single genre!
        console.log(`PPL: single genre! ${movie_genres_string}`)
        movie_genres_string = input_dialogflow_parameter.toString();
        resolve(movie_genres_string);
      } else {
        // No genre detected!
        console.log(`PPL: No genre detected!`);
        movie_genres_string = " ";
        resolve(movie_genres_string);
      }
    } else {
      // The input_dialogflow_parameter parameter didn't pass validation
      console.log("parse parameter list: ELSE STATEMENT");
      movie_genres_string = " ";
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

function genericFallback(conv, intent_name) {
  /*
  Generic fallback function
  */
  console.warn("GENERIC FALLBACK TRIGGERED!");
  const fallback_name = intent_name + '_Fallback';

  //console.log(util.inspect(conv, false, null)); // DEBUG function!

  //console.log(`Generic fallback count: ${conv.data.fallbackCount}`);
  if (conv.data.fallbackCount >= 2) {
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

    const fallback_text = conv.data[text_target];
    const fallback_speech = conv.data[speech_target];
    const suggestions = (conv.data.suggestions).split(', ');

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
}

////////////// Voting intent

function voting_intent (conv, movieGenre) {
  /*
  The trainBot function is the primary training function.
  A basic card is shown to the user, and they are asked if they like the contents of the card.
  The user is provided suggestion chips to pivot the discussion.
  */
  var global_movie_genres_string; // Defined in the following

  return parse_parameter_list(movieGenre, ' ')
  .then(movie_genres_string => {
    global_movie_genres_string = movie_genres_string;
    //console.log(`Training 1 : "${global_movie_genres_string}"`);

    conv.user.storage.movieGenres = global_movie_genres_string;

    if (global_movie_genres_string === ' ' && (typeof(conv.contexts.get('forward_genre_more')) !== 'undefined')) {
      /*
      We're maintaining the genres the user input.
      This context will be active if the user came from 'plot spoilers'.
      */
      if ((typeof(conv.contexts.get('forward_genre_more').parameters['movieGenres'])) !== 'undefined' && conv.contexts.get('forward_genre_more').parameters['movieGenres']) {
        /*
          Be absolutely sure that the 'movieGenres' field actually exists!
        */
        console.log(`TEST: FORWARD_GENRE_MORE EXISTS! ${conv.contexts.get('forward_genre_more').parameters['movieGenres']}`);
        /*
        conv.contexts.set('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
          "placeholder": "placeholder",
          "movieGenres": past_movie_genres_more
        });
        */
        forward_contexts(conv, 'voted', 'forward_genre_more', 'forward_genre_more');
        global_movie_genres_string = conv.contexts.get('forward_genre_more').parameters['movieGenres'];
      }
    } else if (global_movie_genres_string === ' ' && (typeof(conv.contexts.get('forward_genre')) !== 'undefined') && conv.contexts.get('forward_genre').parameters['movieGenres']) {
      /*
      We're maintaining the genres the user input.
      This context will be active if the user came from the 'Training' intent.
      */
      if ((typeof(conv.contexts.get('forward_genre').parameters['movieGenres'])) !== 'undefined') {
        /*
          Be absolutely sure that the 'movieGenres' field actually exists!
        */
        console.log(`TEST: FORWARD_GENRE EXISTS! ${conv.contexts.get('forward_genre').parameters['movieGenres']}`);
        /*
        conv.contexts.set('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
          "placeholder": "placeholder",
          "movieGenres": past_movie_genres
        });
        */
        forward_contexts(conv, 'voted', 'forward_genre', 'forward_genre');
        global_movie_genres_string = conv.contexts.get('forward_genre').parameters['movieGenres'];
      }
      let past_movie_genres = conv.contexts.get('forward_genre').parameters['movieGenres'];

      global_movie_genres_string = past_movie_genres;
    } else if (global_movie_genres_string !== ' ') {
      /*
        The user just entered a new movie genre string.
        Let's store the genres in a context.
        TODO: Store the genre string in conversational data storage?
      */
      conv.contexts.set('forward_genre', 1, { // Setting the 'forward_genre' context for the next loop
        "placeholder": "placeholder",
        "movieGenres": global_movie_genres_string
      });
    }

    //console.log(`Training 2 : "${global_movie_genres_string}"`);
    return global_movie_genres_string;
  })
  .then(global_movie_genres_string => {

    const qs_input = {
      //  HUG REST GET request parameters
      gg_id: parse_userId(conv), // Anonymous google id
      sort_target: 'imdbVotes', // What field we want to sort by. Can be: ['imdbVotes', 'imdbRating', 'released', 'imdbID', 'title']
      sort_direction: 'DESCENDING', // Descending sort of imdbVotes
      genres: global_movie_genres_string, // The user's genre input (Possibilities: ' ', 'genre', 'genre,genre,genre,...' strings)
      actors: ' ', // If we were to add actor search, we'd specify that here.
      api_key: 'HUG_REST_API_KEY'
    };

    //console.log(`Training 3 :"${global_movie_genres_string}"`);

    return hug_request('HUG', 'get_single_training_movie', 'GET', qs_input)
    .then(body => {
      if (body.valid_key === true) {
        var suggestions; // Will change when we

        if (body.success === true) {
          /*
            Triggers if a movie was found.
            Retrieving data from the 'get_single_training_movie' JSON request result
            const moviePlot = body.plot;
          */
          const plot = (body.movie_result.plot).replace('&', 'and');
          const year = body.movie_result.year;
          const posterURL = (body.movie_result.poster).replace("http://", "https://");
          const movieTitle = (body.movie_result.title).replace('&', 'and');
          const imdbRating = body.movie_result.imdbRating;
          const movieID = body.movie_result.imdbID;

          const fallback_messages = [
            `Sorry, what was that?`,
            `Sorry, I didn't catch that, would you watch ${movieTitle}?`,
            `I'm sorry, I didn't understand that. Would you cosider watching ${movieTitle}?`
          ];

          suggestions = [`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, `🤔 recommend me a movie`, '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help'];

          return store_fallback_response(conv, fallback_messages, suggestions)
          .then(() => {
            const genre_list = helpExtract(body.movie_result.genre);
            const actor_list = helpExtract(body.movie_result.actors);
            const director_list = helpExtract(body.movie_result.director);

            /*
            let genre_speech = '';
            let genre_text = '';

            if (genre_list.length > 1) {
              genre_speech = `${movieTitle}'s genres are: ${genre_list}. <break time="0.25s" /> `;
              genre_text = `Genres: ${genre_list}. \n\n`;
            } else {
              genre_speech = `${movieTitle} is a ${genre_list} film. <break time="0.25s" /> `;
              genre_text = `Genre: ${genre_list}. \n\n`;
            }
            */

            return store_movie_data(conv, 'training', movieID, movieTitle, plot, year, imdbRating, genre_list, actor_list, director_list)
            .then(() => {
              const ranking_text = [
                `Would you watch "${movieTitle}"?`,
                `What about "${movieTitle}"?`,
                `How about "${movieTitle}"?`,
                `What do you think of ${movieTitle}?`
              ];

              const random_fact = [
                `${movieTitle} was released in the year ${year}!`,
                `${movieTitle} was directed by ${director_list}!`,
                `${movieTitle} currently has an IMDB rating of ${imdbRating} out of 10!`,
                `The cast of ${movieTitle} is primarily comprised of ${actor_list}!`,
                `${movieTitle} is a ${genre_list} movie!`
              ];
              const chosen_ranking_text = ranking_text[Math.floor(Math.random() * ranking_text.length)];
              const chosen_fact = random_fact[Math.floor(Math.random() * random_fact.length)];
              const textToSpeech =  `<speak>${chosen_ranking_text}<break time="0.75s" />${chosen_fact}</speak>`;
              const textToDisplay = chosen_ranking_text + '\n' + chosen_fact;

              /*
              const textToSpeech = `<speak>` +
                `Would you watch ${movieTitle}? <break time="0.5s" /> ` +
                `Released in the year ${year}, it was directed by ${director_list} and currently has an IMDB rating of ${imdbRating} out of 10. <break time="0.35s" /> ` +
                //`The cast of ${movieTitle} is primarily comprised of ${actor_list}. <break time="0.25s" /> ` +
                //genre_speech +
                `</speak>`;

              const textToDisplay = `Would you watch ${movieTitle}? \n\n` +
                  `Released in ${year}, it was directed by ${director_list} and it currently has an IMDB rating of ${imdbRating}/10. \n\n` +
                  //`The cast of ${movieTitle} is primarily comprised of ${actor_list}. \n\n` +
                  //genre_text;
              */

              return store_repeat_response(conv, 'Training', textToSpeech, textToDisplay) // Storing repeat info
              .then(() => {
                chatbase_analytics(
                  conv,
                  `Showed user ${movieTitle} (${movieID})`, // input_message
                  'Voting', // input_intent
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
                      text: ``,
                      buttons: new Button({
                        title: `🍿 "${movieTitle}" on Google Play?`,
                        url: `https://play.google.com/store/search?q=${movieTitle}&c=movies`,
                      }),
                      image: { // Mostly, you can provide just the raw API objects
                        url: `${posterURL}`,
                        accessibilityText: `${movieTitle}`
                      },
                      display: 'WHITE'
                    }),
                    new Suggestions(`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, `🤔 recommend me a movie`, `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help')
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
            "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
            "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
          ];

          suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

          store_fallback_response(conv, fallback_messages, suggestions);

          chatbase_analytics(
            conv,
            "Couldn't find a movie for user to vote on!", // input_message
            'Voting', // input_intent
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
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
}

////////////// Google Assistant Intents:

app.intent('Welcome', conv => {
  /*
  The welcome intent is the main menu, they arrive here if they launch the bot via the Google Assistant explorer.
  */
  conv.data.fallbackCount = 0;

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
  const suggestion_chips = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestion_chips);

  // Powerful debugging trick!
  // console.log(util.inspect(conv, false, null));

  const textToSpeech = `<speak>` +
    `<emphasis level="moderate">Hey, I'm Vote Goat!</emphasis> <break time="0.5s" /> ` +
    `I crowdsource movie ratings and provide movie recommendations. <break time="0.35s" /> ` + // We can replace the first 2 lines with "Lets get started" When the user is coming for the second time.
    `What would you like to do today? <break time="0.25s" /> ` + //added today to make it more personalised
    `Rank Movies? <break time="0.25s" /> ` +
    `Get a Movie Recommendation? <break time="0.25s" /> ` + //Can we add a More Options after this line, so that it will only read 3 options
    `View your stats? <break time="0.25s" /> ` +            // the remaining options can be read when the user clicks more.
    `View the Greated movies of all time? <break time="0.25s" /> ` +  //Full list can also be displayed at the first time and splitted at next attempt
    `Or do you need help? <break time="0.25s" /> ` +
    `</speak>`;

  const textToDisplay = `Welcome!, I am  Vote Goat! ` +
                        `I crowdsource movie ratings & provide accurate movie recommendations. \n\n ` +
                        `What would you like to do today? \n\n ` +
                        `🗳 Rank Movies? \n\n ` +
                        `🤔 Get a Movie Recommendation? \n\n ` +
                        `🏆 View your stats? \n\n ` +
                        `🐐 View GOAT movies? \n\n ` +
                        `📑 Or do you need help?`;

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

  return voting_intent(conv, movieGenre);
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
      if (typeof(conv.contexts.get('forward_genre')) !== 'undefined') {
        /*
        We're maintaining the genres the user input.
        */
        if (typeof(conv.contexts.get('forward_genre').parameters['movieGenres']) !== 'undefined' && conv.contexts.get('forward_genre').parameters['movieGenres'] !== ' ') {
          // Forwarding genre parameter for next movie ranking
          console.log(`mMD - Setting 'forward_genre_more' to: ${conv.contexts.get('forward_genre').parameters['movieGenres']}`);
          conv.contexts.set('forward_genre_more', 1, { // We're now looping the last input genre until the user provides a new set of parameters
            "placeholder": "placeholder",
            "movieGenres": conv.contexts.get('forward_genre').parameters['movieGenres']
          });
        }
      }

      conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

      const requested_mode = conv.contexts.get('vote_context').parameters['mode']; // Retrieving the expected voting mode (within a list, or during training)!
      const movie_imdb_id = conv.contexts.get('vote_context').parameters['movie']; // Retrieving the movie we want to downvote!
      const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the title
      let movie_plot = conv.contexts.get('vote_context').parameters['plot']; // Retrieving the plot

      const fallback_messages = [
        `Sorry, what was that?`,
        `Sorry, I didn't catch that, would you watch ${movie_title}?`,
        `I'm sorry, I didn't understand that. Would you cosider watching ${movie_title}?`
      ];

      var suggestions;

      if (requested_mode === 'list_selection') {
        suggestions = [`👍`, `👎`, '🗳 Rank Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
      } else {
        suggestions = [`👍`, `👎`, `🤔 recommend me a movie`, `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
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

      conv.contexts.set('vote_context', 1, { // Specifying the data required to vote!
        "mode": requested_mode,
        "movie": movie_imdb_id
      });

      const textToSpeech_prequel = `<speak>` +
        `Here's more info on ${movie_title}! <break time="0.5s" /> ` +
        `${movie_title} is an ${conv.contexts.get('vote_context').parameters['genres']} movie which was released in the year ${conv.contexts.get('vote_context').parameters['year']}, it was directed by ${conv.contexts.get('vote_context').parameters['directors']} and currently has an IMDB rating of ${conv.contexts.get('vote_context').parameters['imdb_rating']} out of 10. <break time="0.35s" /> ` +
        `The cast of ${movie_title} is primarily comprised of ${conv.contexts.get('vote_context').parameters['actors']}. <break time="0.25s" /> ` +
        `</speak>`;

      const textToDisplay_prequel = `Would you watch ${movie_title}? \n\n` +
          `Released in ${conv.contexts.get('vote_context').parameters['year']}, it was directed by ${conv.contexts.get('vote_context').parameters['directors']} and it currently has an IMDB rating of ${conv.contexts.get('vote_context').parameters['imdb_rating']}/10. \n\n` +
          `The cast of ${movie_title} is primarily comprised of ${conv.contexts.get('vote_context').parameters['actors']}.`;

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
    return catch_error(conv, 'No "vote_context" detected!', 'moreMovieInfo');
  }
});

app.intent('voted', (conv, { voting }) => {
  /*
  Provides voting functionality.
  */
  const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the expected voting mode (within a list, or during training)!

  const fallback_messages = [
    `Sorry, what was that?`,
    `Sorry, I didn't catch that, would you watch "${movie_title}"?`,
    `I'm sorry, I didn't understand that. Would you cosider watching "${movie_title}"?`
  ];

  const suggestions = [`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, `🤔 recommend me a movie`, '📑 Help'];

  store_fallback_response(conv, fallback_messages, suggestions);

  if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
    return interpret_voting_intention(conv, voting)
    .then(voting_intention => {
      //conv.contexts.get('vote_cotext').parameters['voting.original'];
      //console.log(conv.contexts.get('vote_context'));
      //const requested_mode = conv.contexts.get('vote_context').parameters['mode']; // Retrieving the expected voting mode (within a list, or during training)!
      //const movie_imdb_id = conv.contexts.get('vote_context').parameters['movie']; // Retrieving the movie we want to downvote!
        //console.log(`TRAINING DEBUG: ${conv.contexts.get('vote_context').parameters['mode']} & ${conv.contexts.get('vote_context').parameters['movie']}`);
        const qs_input = {
          //  HUG REST GET request parameters
          gg_id: parse_userId(conv), // Anonymous google id
          movie_id: conv.contexts.get('vote_context').parameters['movie'], // Passing the movie ID acquired via context
          rating: voting_intention, // The rating we're setting for the movie we just displayed to the user.
          mode: conv.contexts.get('vote_context').parameters['mode'],
          conv_id: conv.id,
          raw_vote: (conv.input.raw).toString(),
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
                //console.log("LOOPING BACK TO TRAINING!");

                if (typeof(conv.contexts.get('forward_genre')) !== 'undefined') {
                  // The 'forward_genre' exists!
                  if (typeof(conv.contexts.get('forward_genre').parameters['movieGenres']) !== 'undefined' && conv.contexts.get('forward_genre').parameters['movieGenres'] !== ' ') {
                    // Forwarding genre parameter for next movie ranking
                    console.log(`Voted intent: Forwarded genre 1!`);
                    forward_contexts(conv, 'voted', 'forward_genre', 'forward_genre');
                  }
                }

                if (typeof(conv.contexts.get('forward_genre_more')) !== 'undefined') {
                  // The 'forward_genre_more' context exists
                  if (typeof(conv.contexts.get('forward_genre_more').parameters['movieGenres']) !== 'undefined' && conv.contexts.get('forward_genre_more').parameters['movieGenres'] !== ' ') {
                    // Forwarding genre parameter for next movie ranking
                    console.log(`Voted intent: Forwarded genre 2!`);
                    forward_contexts(conv, 'voted', 'forward_genre_more', 'forward_genre_more');
                  }
                }

                chatbase_analytics(
                  conv,
                  `User successfully voted in training!`, // input_message
                  'voted_ranking', // input_intent
                  'Win' // win_or_fail
                );

                return check_recent_activity(conv, voting_intention)
                .then(progress_response => {
                  if (progress_response !== '') {
                    conv.ask(
                      new SimpleResponse({
                        speech: `<speak>${progress_response}</speak>`,
                        text: progress_response
                      })
                    );
                  }
                  return progress_response;
                })
                .then(progress_response => {
                  return voting_intent(conv, []); // Attempting to loop! Empty genre parameter, will hopefully get the data from contexts.
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
                  textToSpeech = `<speak>` +
                    `Huzzah, a successful movie recommendation! <break time="0.25s" /> ` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store. <break time="0.5s" /> ` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?` +
                    `</speak>`;
                  textToDisplay = `Huzzah, a successful movie recommendation! \n\n` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store. \n\n` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?`;

                  chatbase_analytics(
                    conv,
                    `Successful movie recommendation: ${movie_title}`, // input_message
                    'voted_recommendation', // input_intent
                    'Win' // win_or_fail
                  );
                } else {
                  // The user does not like the movie (Overall downvote)
                  // If we kept track of how many times they recently saw this intent then we could reduce text repetition.
                  textToSpeech = `<speak>` +
                    `Sorry about that. <break time="0.25s" /> ` +
                    `Try ranking more movies to improve your future recommendations. <break time="0.5s" /> ` +
                    `What do you want to do next? Rank movies, view your stats, get help or quit?` +
                    `</speak>`;
                  textToDisplay = `Sorry about that. \n\n` +
                    `Try ranking more movies to improve future recommendations. \n\n` +
                    `What do you want to do next? Rank movies, view your stats, get help or quit?`;

                  chatbase_analytics(
                    conv,
                    `Unsuccessful movie recommendation!`, // input_message
                    'voted_recommendation', // input_intent
                    'Win' // win_or_fail
                  );
                }

                conv.contexts.set('final_prompt', 1, {
                  'placeholder': 'placeholder',
                  'voting_intention': voting_intention
                });

                store_repeat_response(conv, 'voted', textToSpeech, textToDisplay); // Storing repeat info

                return check_recent_activity(conv, voting_intention)
                .then(progress_response => {
                  conv.ask(
                    new SimpleResponse({
                      speech: `<speak>${progress_response}</speak>`,
                      text: progress_response
                    })
                  );

                  conv.ask(
                    new SimpleResponse({
                      speech: textToSpeech,
                      text: textToDisplay
                    })
                  );

                  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
                    conv.ask(
                      new Suggestions('🗳 Rank Movies', '🤔 recommend me a movie', '🏆 Show Stats', `🚪 Quit`)
                    );
                  }
                })
              } else {
                console.error('An error was encountered in upvote function');
                /*
                  TODO: Change this from catch_error to a redirect to voting, pretend the last vote worked?
                  If the user is shown a movie, then they lock their phone for a bit, the context dies and they experience this error!

                  TODO: Store context indo into the
                */
                return catch_error(conv, 'No voting mode detected!', 'voting intent');
              }
            } else {
              /*
                Shouldn't trigger - the user didn't have the 'voting_context' context!
                TODO: Rather than prompt an error, attempt to recover voting_context from user.storage, or use handle_no_contexts function!
              */
              console.log('Voting intent error: No voting_context context present!');
              return catch_error(conv, 'No voting mode detected!', 'voting intent');
            }
          } else {
            // This will only trigger if the API key changes.
            // Better than an unhandled crash!
            return catch_error(conv, 'Invalid Hug API KEY!', 'voting intent');
          }
        })
        .catch(error_message => {
          return catch_error(conv, error_message, 'voted');
        });
    })
    .catch(() => {
      // We didn't hear any valid input from the user!
      console.log("Invalid vote detected! Sent to fallback!");
      //return catch_error(conv, 'ERROR: Vote is not valid?', 'voted'); // TODO: Redirect to fallback instead of catching error?
      return genericFallback(conv, `voted`);
    });
  } else {
    // No 'vote_cotext' context detected
    console.error(`CONV DATA: "${conv.data.voting_mode}",  "${conv.data.voting_movieID}", "${conv.data.voting_movieTitle}",  "${conv.data.voting_moviePlot}", "${conv.data.voting_movieYear}" #### USER STORAGE:  "${conv.user.storage.voting_mode}", "${conv.user.storage.voting_movieID}", "${conv.user.storage.voting_movieTitle}",  "${conv.user.storage.voting_moviePlot}",  "${conv.user.storage.voting_movieYear}"`);
    return catch_error(conv, 'No voting context detected!', 'moreMovieInfo');
  }
});

app.intent('goat', (conv, { movieGenre }) => {
  /*
  Displaying the most upvoted movies to the user.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // For fallback handling

  var movie_genres_string; // Declaring before promise
  var movie_genres_comma_separated_string; // Declaring before promise

  return parse_parameter_list(movieGenre, ' ')
  .then(parsed_movieGenre_string => {
    movie_genres_string = parsed_movieGenre_string;
    //console.log(`GOAT 1: "${parsed_movieGenre_string}" & "${movie_genres_string}"`);

    return parse_parameter_list(movieGenre, ', verbose')
    .then(parsed_movieGenre_comma_separated_string => {

      movie_genres_comma_separated_string = parsed_movieGenre_comma_separated_string;
      //console.log(`GOAT 1: "${parsed_movieGenre_comma_separated_string}" & "${movie_genres_string}"`);

      const qs_input = {
        //  HUG REST GET request parameters
        genres: movie_genres_string, // Anonymous google id
        api_key: 'HUG_REST_API_KEY'
      };

      return hug_request('HUG', 'get_goat_movies', 'GET', qs_input)
      .then(body => {
        if (body.goat_movies.length > 1) {
          if (body.success === true && body.valid_key === true) {

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

                if (index != (body.goat_movies.length - 1)) {
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
                //console.log(`GOAT rows 1: ${goat_rows_list}`);
                goat_movies_list = goat_rows_list;
                return goat_rows_list;
              })
              .then(goat_rows_list => {
                //console.log(`goat rows 2: ${goat_rows_list}`);
                if (movie_genres_comma_separated_string.length > 2) {
                  // The user provided genre parameters
                  // >2 because no movie genres is ` `
                  textToSpeech = `<speak>` +
                                   `The greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                    goat_voice +
                                 `</speak>`;
                  textToDisplay = `The greatest ${movie_genres_comma_separated_string} movies of all time, as determined by our userbase are:\n\n${goat_text}`;
                } else {
                  // The user didn't provide genre parameters
                  textToSpeech = `<speak>` +
                                   `The greatest movies of all time, as determined by our userbase are: <break time="0.35s" /> ` +
                                    goat_voice +
                                 `</speak>`;
                  textToDisplay = `The greatest movies of all time, as determined by our userbase are:\n\n${goat_text}`;
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

                conv.ask(
                  new SimpleResponse({
                    speech: textToSpeech,
                    text: textToDisplay
                  }),
                  new Table({
                    title: 'GOAT Movies',
                    subtitle: `Greatest ${movie_genres_comma_separated_string} movies of all time!`,
                    dividers: true,
                    columns: ['Title', 'IMDB Rating', 'GOAT Ranking'],
                    rows: goat_movies_list
                  }),
                  new SimpleResponse({
                    speech: '<speak>What do you want to do next?</speak>',
                    text: 'What do you want to do next?'
                  }),
                  new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`)
                );
                store_repeat_response(conv, 'getGoat', textToSpeech, textToDisplay); // Storing repeat info
              });

            } else {
              /*
                The user doesn't have a screen!
                Best practice is to only present 3 list results, not 10.
                We aught to provide some sort of paging to
              */
              if (movie_genres_comma_separated_string != ``) { // TODO: Check if the function returns '' or ' '!
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
              store_repeat_response(conv, 'getGoat', textToSpeech, textToDisplay); // Storing repeat info
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
            /*buttons: new Button({
              title: `🍿 Share user ranking`,
              url: ``, // TODO: Auto-generate an image or web page for users to save a certificate of leaderboard ranking with their friends
            }),
            image: { // Mostly, you can provide just the raw API objects
              url: `${movie_element.poster_url}`,
              accessibilityText: `${movie_element.title}`
            },*/
            display: 'WHITE'
          })
        );
      }

      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
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
});

app.intent('recommend_movie', (conv) => {
  /*
  Movie recommendation intent.
  Has built in A/B testing via the 'get_ab_value' HUG function.
  TODO:
  * Improve the HUG function to be less aggressive (x% of users, not 50% hardcoded)
  * Replace random movies with computed model movie recommendations.    Movie recommendation intent.
      Has built in A/B testing via the 'get_ab_value' HUG function.
      TODO:
      * Improve the HUG function to be less aggressive (x% of users, not 50% hardcoded)
      * Replace random movies with computed model movie recommendations.
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

  const userId = parse_userId(conv);

  const ab_lets = {
    //  HUG REST GET request parameters
    gg_id: userId, // Anonymous google id
    api_key: 'HUG_REST_API_KEY'
  };

  return hug_request('HUG', 'get_ab_value', 'GET', ab_lets)
  .then(ab_body => {
    if (ab_body.success === true) {
      let ab_value = ab_body.ab_value // Either 0 or 1
      const ab_recommendation_options = {
        //  HUG REST GET request parameters
        gg_id: userId, // Anonymous google id
        api_key: 'HUG_REST_API_KEY'
      };

      let target_recommendation_function;
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
        if (rec_body.success === true && rec_body.valid_key === true) {
          const quantity_top_k = rec_body.movies.length; // NOT PROVEN! Get the quantity of movies in top-k results.

          if (quantity_top_k > 0) {

            //let movie_list = []; // Where we'll store the list elements
            let parameters = {}; // Creating parameter holder
            let carousel_items = {}; // Creating carousel item holder

            for (let iterator = 0; iterator < quantity_top_k; iterator++) { // Iterating over the top k rec_body results!
              /*
              Given the quantity of movies returned in the JSON (eventually top-k movies),
              produce the 'buildOptionItem' element and store it in the 'movie_list' list.
              */

              if (iterator > 9) {
                 // Can't place more than 10 items in the carousel!
                break;
              } else {
                // Extracting neccessary data from the returned HUG JSON response
                const index_value = iterator.toString(); // Creating string representation of index for context data
                const current_movieTitle = rec_body.movies[iterator].title;
                rec_body.movies[iterator].poster_url = (rec_body.movies[iterator].poster_url).replace("http://", "https://"); // Replacing http for https for use in contexts!
                const genre_list = helpExtract(rec_body.movies[iterator].genres);

                parameters[index_value] = rec_body.movies[iterator]; // Inserting the 'get_random_movie_list' rec_body contents into the context parameter.

                // Need to insert 9 movies into carousel item
                carousel_items[index_value] = {
                  title: `${current_movieTitle}`,
                  description: `Genres: ${genre_list}\nIMDB ⭐: ${rec_body.movies[iterator].imdbRating}\nYear: ${rec_body.movies[iterator].year}`,
                  image: new Image({
                    url: `${(rec_body.movies[iterator].poster_url).replace("http://", "https://")}`, // Replacing http for https for use in current carousel item!
                    alt: `${current_movieTitle}`
                  }),
                  footer: `# ${iterator}`,
                  synonyms: [`${iterator}`, `${current_movieTitle}`]
                }
              }
            }

            conv.contexts.set('list_body', 1, parameters); // Setting the outbound context to include the JSON rec_body parameter data!

            if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
              /*
                The user has a screen, let's show the carousel & suggestions
              */
              chatbase_analytics(
                conv,
                `10 recommended movies!`, // input_message
                'recommend_movie', // input_intent
                'Win' // win_or_fail
              );

              conv.ask(
                new SimpleResponse('Alright, here are a few movies which I think you will like!'),
                // Create a browse carousel
                new Carousel({
                  items: carousel_items
                }),
                new Suggestions('🗳 Rank Movies', '🏆 Show Stats', '📑 Help')
              );
            } else {
              /*
              Best practice (according to Google) for presenting list/carousel items to speaker-only users is to only provide the first 3 movies.
              We still hold the data for movies 0-9 in the background, but we only tell the user about the first 3.
              This can be changed at any time by adding lines w/ incremented '${rec_body[x].title}' tags.
              */
              const textToSpeech = `<speak>` +
                `Would you watch the following movies? <break time="0.25s" /> ` +
                `${rec_body.movies[0].title}? <break time="0.35s" /> ` +
                `${rec_body.movies[1].title}? <break time="0.35s" /> ` +
                `${rec_body.movies[2].title}? <break time="0.35s" /> ` +
                `</speak>`;

              // Do we even need to provide the speakers text to display? Will potentially throw a warning?
              const textToDisplay = `Would you watch the following movies? ` +
                                    `${rec_body.movies[0].title}? ` +
                                    `${rec_body.movies[1].title}? ` +
                                    `${rec_body.movies[2].title}? `;

              chatbase_analytics(
                conv,
                `3 recommended movies for speaker!`, // input_message
                'recommend_movie', // input_intent
                'Win' // win_or_fail
              );

              store_repeat_response(conv, 'recommendMovie', textToSpeech, textToDisplay); // Storing repeat info

              conv.contexts.set('recommend_movie_context', 1, {
                "placeholder": "placeholder",
                "repeatedCarousel": carousel_items
              });

              conv.ask(
                new SimpleResponse({
                  speech: textToSpeech,
                  text: textToDisplay
                })
              );
            }
          } else {
            //console.log("recommendMovie: No movies were returned! Movies SHOULD have been returned!");
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

});

app.intent('dislike.all.recommendations', (conv) => {
  /*
  Erasing the contexts then sending users to training mode!
  */
  conv.data.fallbackCount = 0; // Required for tracking fallback attempts!

  console.log("USER Disliked all recommendations!");
  if (typeof(conv.contexts.get('list_body')) !== "undefined") {

    let iterator_max;

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      // Showing devices with a screen 10 items
      iterator_max = 9;
    } else {
      // For speakers, skipping submitting bad ratings to movies 3-9 (not displayed to them).
      iterator_max = 2;
    }

    for (let iterator = 0; iterator < 10; iterator++) { // Iterating over the top k body results!

      if (iterator > iterator_max) {
        break; // Greater than 9 is invalid.
      } else {
        let string_iterator = iterator.toString();

        const option = {
          //  HUG REST GET request parameters
          gg_id: parse_userId(conv), // Anonymous google id
          movie_id: conv.contexts.get('list_body').parameters[string_iterator].imdbID, // Passing the movie ID acquired via context
          rating: 0, // The rating we're setting for the movie we just displayed to the user.
          mode: 'multi vote',
          api_key: 'HUG_REST_API_KEY'
        };

        return hug_request('HUG', 'submit_movie_rating', 'POST', option)
        .then(() => {
          console.log(`mass downvote!`);
        }) // END of the GET request!
        .catch(error_message => {
          return catch_error(conv, error_message, 'submit_movie_rating');
        });
      }
    } // End of loop

    let textToSpeech;
    let textToDisplay;

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

    conv.ask(
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech,
        text: textToDisplay
      })
    );

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
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
    return catch_error(conv, 'No voting contexts !', 'voted');
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

    const options = {
      //  HUG REST GET request parameters
      gg_id: parse_userId(conv), // Anonymous google id
      k_mov_ts: movie_element.k_mov_ts,
      clicked_movie: movie_element.imdbID, // Passing the movie ID acquired via context
      api_key: 'HUG_REST_API_KEY'
    };

    return hug_request('HUG', 'log_clicked_item', 'POST', options)
    .then(() => {
      //console.log('Successfully posted the clicked item to hug/mongodb!');

      conv.contexts.set('recommend_movie_context', 0, { // Duration 0 to erase the context!
        "placeholder": "placeholder",
        "repeatedRichResponse": "", // Erasing context!
        "repeatedCarousel": "" // Erasing context!
      });

      conv.contexts.set('item_selected_context', 1, { // Placeholder to initialize/trigger the 'item_selected_context' context.
        "placeholder": "placeholder"
      });

      let title_let = (movie_element.title).replace('&', 'and'); // & characters invalidate SSML

      return parse_parameter_list(movie_element.genres, ', ')
      .then(movie_genres_string => {
        store_movie_data(conv, 'list_selection', movie_element.imdbID, movie_element.title, movie_element.plot, movie_element.year, movie_element.imdbRating, movie_genres_string);

        const genre_list = helpExtract(movie_element.genres);
        const actor_list = helpExtract(movie_element.actors);
        const director_list = helpExtract(movie_element.director);

        var textToSpeech = `<speak>`;

        if (genre_list.length > 1) {
          textToSpeech += `"${title_let}" is an ${genre_list} movie, with a cast primarily comprised of ${actor_list}. <break time="0.35s" />`;
        } else if (genre_list.length == 1) {
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

        conv.ask(
          new SimpleResponse({
            // Sending the details to the user
            speech: textToSpeech,
            text: textToDisplay
          })
        );

        if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
          conv.ask(
            new BasicCard({
              title: `${movie_element.title} (${movie_element.year})`,
              text: `Plot: ${movie_element.plot}`,
              buttons: new Button({
                title: `🍿 Google Play Search`,
                url: `https://play.google.com/store/search?q=${movie_element.title}&c=movies`,
              }),
              image: { // Mostly, you can provide just the raw API objects
                url: `${(movie_element.poster_url).replace("http://", "https://")}`, // NO HTTP ALLOWED!
                accessibilityText: `${movie_element.title}`
              },
              display: 'WHITE'
            }),
            new Suggestions(`👍`, `👎`, `🎬 more movie info`, `🍿 Watch movie online`, '🗳 Rank Movies', '🏆 Show Stats', '📑 Help')
          );
        }
      });
    }) // END of the GET request!
    .catch(error_message => {
      return catch_error(conv, error_message, 'recommendation');
    });
  } else {
    // Shouldn't happen, but better safe than sorry!
    return catch_error(conv, 'No "list_body" context detected!', 'itemSelected');
  }
}); // end of itemSelected function!

app.intent('recommend_movie.Fallback', (conv) => {
  /*
  Fallback function for the voting mechanisms!
  Change the CAROUSEL_FALLBACK contents if you want different responses.
  */
  //console.log("RECOMMEND FALLBACK TRIGGERED!");
  const recommendation_context = conv.contexts.get('recommend_movie_context');

  if (typeof(conv.contexts.get('recommend_movie_context')) !== "undefined" && typeof(conv.contexts.get('list_body')) !== "undefined") {

    let carousel = recommendation_context['repeatedCarousel'].value;
    let first_movie = conv.contexts.get('list_body').parameters['0']; // Grabbing the first movie_element
    let second_movie = conv.contexts.get('list_body').parameters['1']; // Grabbing the second movie_element
    let third_movie = conv.contexts.get('list_body').parameters['2']; // Grabbing the third movie_element

    var CAROUSEL_FALLBACK_DATA;

    if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
      CAROUSEL_FALLBACK_DATA = [
        "Sorry, which film was that?",
        "I didn't catch that. Could you repeat your movie selection?",
        "I'm having difficulties understanding your movie selection. Which movie from the list are you most interested in watching?"
      ];
    } else {
      // We need to remind users without screens what the movies were!
      CAROUSEL_FALLBACK_DATA = [
        "Sorry, which film was that?",
        `I didn't catch that. Could you repeat your movie selection?`,
        `I'm having difficulties understanding. The movies were ${first_movie.title}, ${second_movie.title} and ${third_movie.title}. Interested in any of them?`
      ];
    }

    const current_fallback_value = parseInt(conv.data.fallbackCount, 10); // Retrieve the value of the intent's fallback counter
    conv.data.fallbackCount++; // Iterate the fallback counter

    if (current_fallback_value >= 2) {
      // The user failed too many times
      chatbase_analytics(
        conv,
        `User failed the movie recommendation fallback & force quit!`, // input_message
        'recommend_movie.Fallback', // input_intent
        'Fail' // win_or_fail
      );

      conv.close("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
    } else {
      /*
        Displaying carousel fallback & forwarding contexts in case of subsequent carousel fallbacks
      */
      forward_contexts(conv, 'carousel_fallback', 'recommendation_context', 'recommendation_context');
      forward_contexts(conv, 'carousel_fallback', 'list_body', 'list_body');

      const textToSpeech = `<speak>${CAROUSEL_FALLBACK_DATA[current_fallback_value]}</speak>`;
      const textToDisplay = CAROUSEL_FALLBACK_DATA[current_fallback_value];

      store_repeat_response(conv, 'listFallback', textToSpeech, textToDisplay); // Storing repeat info

      chatbase_analytics(
        conv,
        `We didn't understand what movie the user wanted to watch! Prompted with fallback!`, // input_message
        'recommend_movie.Fallback', // input_intent
        'Fail' // win_or_fail
      );

      conv.ask(
        new SimpleResponse({
          speech: textToSpeech,
          text: textToDisplay
        }),
        new Carousel({
          items: carousel
        })
      );
      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🏆 Show Stats', '📑 Help')
        );
      }
    }
  } else {
    /*
      Somehow the user triggered the carousel fallback without having the carousel contexts.
     Shouldn't occur, but better safe than sorry!
    */
    return catch_error(conv, 'No "list_body" context detected!', 'itemSelected');
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

  const suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🚪 Quit`];

  store_fallback_response(conv, fallback_messages, suggestions);

  chatbase_analytics(
    conv,
    `The user asked for help!`, // input_message
    'getHelpAnywhere', // input_intent
    'Win' // win_or_fail
  );

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

  /*
    Storing repeat info.
    Only repeating the first section for now!
    TODO: Simplify the help text, or repeat the second text string?
    TODO: Improve granularity of
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
      new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🚪 Quit`)
    );
  }
});

app.intent('goodbye', conv => {
  /*
  An intent enabling the user to manually quit the bot.
  We can't provide suggestion chips, but button links still work (for outbound survey request on exit).
  */
  const textToSpeech = `<speak>` +
    `Sorry to see you go, come back soon? <break time="0.35s" /> ` +
    `Goodbye.` +
    `</speak>`;
  const textToDisplay = `Sorry to see you go, come back soon? \n\n` +
    `Goodbye.`;

  chatbase_analytics(
    conv,
    'The user asked to quit the app!', // input_message
    'Goodbye', // input_intent
    'Win' // win_or_fail
  );

  conv.data = {};
  conv.close(
    new SimpleResponse({
      // Sending the details to the user
      speech: textToSpeech,
      text: textToDisplay
    })
  );
});

//////////// TESTING:

app.intent('where_to_watch', (conv) => {
  /*
  Browsing carousel with amazon, google play, youtube, etc hyperlinks - enabling our users to consume content we recommend!
  Similar to moreMovieInfo!
  TODO: Dialogflow input movie title/imdbID, not vote contexts.
  */
  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT') && conv.surface.capabilities.has('actions.capability.WEB_BROWSER')) {
    if (typeof(conv.contexts.get('vote_context')) !== 'undefined') {
      // vote context exists
      if (typeof(conv.contexts.get('vote_context').parameters['mode']) !== 'undefined') {
        // mode exists within vote context
        conv.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

        const requested_mode = conv.contexts.get('vote_context').parameters['mode']; // Retrieving the expected voting mode (within a list, or during training)!
        const movie_imdb_id = conv.contexts.get('vote_context').parameters['movie']; // Retrieving the movie we want to downvote!
        const movie_title = conv.contexts.get('vote_context').parameters['title']; // Retrieving the title

        const fallback_messages = [
          `Sorry, what was that?`,
          `Sorry, I didn't catch that, what do you want to do next?`,
        ];

        var suggestions;

        if (requested_mode === 'list_selection') {
          suggestions = ['🗳 Rank Movies', `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
        } else {
          suggestions = [`🤔 recommend me a movie`, `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help'];
        }

        store_fallback_response(conv, fallback_messages, suggestions);

        conv.contexts.set('vote_context', 1, { // Specifying the data required to vote!
          "mode": requested_mode,
          "movie": movie_imdb_id
        });

        const textToSpeech = `<speak>` +
          `Try a few of the following links, availability of "${movie_title}" may differ depending on geographic location.` +
          `</speak>`;

        const textToDisplay = `Try a few of the following links, availability of "${movie_title}" may differ depending on geographic location.`;

        store_repeat_response(conv, 'moreMovieInfo', textToSpeech, textToDisplay); // Storing repeat info

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
            'url': `https://play.google.com/store/search?q=${movie_title}&c=movies`,
            'img_url': `https://www.gstatic.com/android/market_images/web/play_prism_hlock_2x.png`, //TODO: CHANGE HOTLINK
            'img_alt': `Google Play logo`,
            'description': `Potentially available to rent/buy via the Google Play movie store.`,
            'footer': ``
          },
          {
            'title': 'Netflix',
            'url': `https://www.netflix.com/search?q=${movie_title}`,
            'img_url': `https://i.imgur.com/YblTE8T.png`, // TODO: Not use imgur
            'img_alt': `Netflix logo`,
            'description': `Potentially available via Netflix subscription.`,
            'footer': ``
          },
          {
            'title': 'Justwatch',
            'url': `https://www.justwatch.com/`,
            'img_url': `https://www.justwatch.com/company/assets/JustWatch-icon.png`,
            'img_alt': `Justwatch logo`,
            'description': `Justwatch is an EU funded legal streaming search engine service, saving you time searching!`,
            'footer': ``
          },
          {
            'title': 'GoWatchIt',
            'url': `https://gowatchit.com/search?terms=${movie_title}`,
            'img_url': `https://i.imgur.com/nJc4F4I.png`,
            'img_alt': `GoWatchIt logo`,
            'description': `GoWatchIt (US-only) provides movie search across many services.`,
            'footer': ``
          },
          {
            'title': 'ReelGood',
            'url': `https://reelgood.com/search?q=${movie_title}`,
            'img_url': `https://i.imgur.com/e2gDcVK.png`,
            'img_alt': `ReelGood logo`,
            'description': `Search engine for streaming content.`,
            'footer': ``
          },
          {
            'title': 'Amazon Prime',
            'url': `https://www.amazon.co.uk/s/?url=search-alias%3Dprime-instant-video&field-keywords=${movie_title}`,
            'img_url': `https://m.media-amazon.com/images/G/02/digital/video/New_MLP/Prime_Smile_logo_133x80.png`,
            'img_alt': `Amazon Prime logo`,
            'description': `Potentially available to rent/buy or view for free through Prime subscription.`,
            'footer': ``
          },
          {
            'title': 'Google search',
            'url': `https://www.google.com/search?q=watch+${movie_title}+online`,
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

        conv.ask(new BrowseCarousel({
          items: carousel_items
        }));

        conv.ask(
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
      return catch_error(conv, 'No "vote_context" detected!', 'moreMovieInfo');
    }
  } else {
    conv.close(
      new SimpleResponse({
        speech: '<speak>Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.</speak>',
        text: 'Sorry, this function requires both screen and web browser functionality. Please switch device, or try Googling where to watch this movie.'
      })
    );
  }
});


//////////// Fallback Intents

/*
  The following redirect the intent specific fallbacks to the 'input.unknown' intent.
*/
app.intent('Welcome - fallback', 'input.unknown');
app.intent('dislike.all.recommendations - fallback', 'input.unknown');
app.intent('getHelpAnywhere - fallback', 'input.unknown');
app.intent('getLeaderBoards - fallback', 'input.unknown');
app.intent('goat - fallback', 'input.unknown');
app.intent('moreMovieInfo - fallback', 'input.unknown');
app.intent('Training - fallback', 'input.unknown');
app.intent('voted - fallback', 'input.unknown');
app.intent('ItemSelected.Fallback', 'input.unknown');

app.intent('input.unknown', conv => {
  /*
  Generic fallback intent used by all intents!
  */
  if (typeof(conv.data.fallbackCount) === "undefined") {
    /*
      The user has not matched any intents & their past conversation has expired - they're continuing the previous conversation's dialog.
      Both contexts and conv.data expire after a certain period of inactivity.
    */
    conv.data.fallbackCount = 0 // Set the fallback to 0, enabling genericFallback to work

    if (conv.user.storage.last_intent_name === "item.selected" | conv.user.storage.last_intent_name === "Training") {
      var movieGenre;

      if (typeof(conv.user.storage.movieGenre) === "undefined") {
        movieGenre = ' ';
      } else {
        movieGenre = conv.user.storage.movieGenre;
      }
      return voting_intent(conv, movieGenre);
    }

    conv.data.fallback_text_0 = "Sorry, what do you want to do next?";
    conv.data.fallback_text_1 = "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?";
    conv.data.fallback_speech_0 = "<speak>Sorry, what do you want to do next?</speak>";
    conv.data.fallback_speech_1 = "<speak>I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?</speak>";
    conv.data.suggesions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🚪 Quit`];
  }

  chatbase_analytics(
    conv,
    `Handled user fallback prompt!`, // input_message
    `input.unknown.${conv.user.storage.last_intent_name}`, // input_intent
    'Fail' // win_or_fail
  );

  return genericFallback(conv, `bot.fallback`);
});

app.catch((conv, error_message) => {
  /*
    Generic error catch
  */
  console.error(error_message);
  return catch_error(conv, error_message, 'Generic_Error');
});

exports.VoteGoat = functions.https.onRequest(app);
