'use strict'; // Mandatory js style?

process.env.DEBUG = 'actions-on-google:*'; // Creates a lot of log data in firebase, highly recommended when submitting to google (they'll try to trigger errors)
const App = require('actions-on-google').DialogflowApp; // Mandatory
const functions = require('firebase-functions'); // Mandatory when using firebase
const requestLib = require('request'); // Used for querying the HUG.REST API
const http = require('https'); // Required for request's https use? Or dead code?...
//const hug_host = 'https://staging.domain.tld'; // THIS IS THE STAGING SERVER! CHANGE BEFORE DEPLOYING TO PRODUCTION!
//const hug_nn_host = 'https://nn.domain.tld'; // This is the online neural network server!
const hug_host = 'https://prod.domain.tld'; // THIS IS THE PRODUCTION SERVER! CHANGE WHEN RUNNING STAGING TESTS!

// Constants for Dialogflow Agent Actions
const WELCOME_ACTION = 'Welcome'; // Welcome intent. (Accessed after the permissions are checked)
const WELCOME_FALLBACK = 'Welcome.Fallback'; // Welcome intent's fallback (Home)

const TRAIN_ACTION = 'Training'; // Training intent
const TRAIN_FALLBACK = 'Training.Fallback'; // Training intent's fallback function
const MOVIE_INFO_ACTION = 'moreMovieInfo'; // moreMovieInfo intent
const MOVIE_INFO_FALLBACK = 'moreMovieInfo.Fallback'; // moreMovieInfo intent's fallback function
const VOTED_ACTION = 'voted'; // Voted intent function pointer
const FINAL_FALLBACK = 'finalFallback'; // Fallback for post-vote app.ask() (When we present the survey & their next options)

const DISLIKE_RECOMMENDATIONS_ACTION = 'dislike.all.recommendations'; // Dislike recommendations intent
const DISLIKE_RECOMMENDATIONS_FALLBACK = 'dislike.all.recommendations.fallback'; // Dislike recommendations intent
const RECOMMEND_ACTION = 'recommend_movie'; // movieRec intent
const RECOMMEND_FALLBACK = 'recommend_movie.Fallback'; // Fallback for the movie recommendations (first documented case of app.askWithCarousel() fallback)

const ITEM_SELECTED = 'item.selected'; // List item selected
const ITEM_SELECTED_FALLBACK = 'ItemSelected.Fallback'; // Fallback for the selected item function (similar view to ranking, except after voting they get a survey prompt)

const GOODBYE = 'goodbye'; // Exit intent
const LEADERBOARD = 'getLeaderBoards'; // Statistics intent
const LEADERBOARD_FALLBACK = 'getLeaderBoards.Fallback'; // Statistics Fallback
const GOAT = 'goat'; // GOAT intent (Greatest of all time)
const GOAT_FALLBACK = 'goat.Fallback'; // GOAT Fallback
const HELPANYWHERE = 'getHelpAnywhere'; // Help Anywhere intent
const HELPANYWHERE_FALLBACK = 'getHelpAnywhere.Fallback'; // Help Anywhere Fallback
const HANDLE_NO_CONTEXTS_FALLBACK = 'handle_no_contexts.Fallback'; // Fallback for the 'handle_no_contexts' function

exports.VoteGoat = functions.https.onRequest((req, res) => {
  /*
  This is the highest level function which is installed & monitored in firebase!
  */
  const app = new App({
    request: req,
    response: res
  });
  //console.log('Request headers: ' + JSON.stringify(req.headers));
  //console.log('Request body: ' + JSON.stringify(req.body));

  if (app.isRequestFromDialogflow("USERNAME", "PASSWORD")) {
    /*
      We're checking that the webhook request actually came from dialogflow.
      Why? For security & because it's required before submitting to google for approval.
      https://developers.google.com/actions/reference/nodejs/DialogflowApp#isRequestFromDialogflow
    */
    //console.log("REQUEST IS FROM DIALOGFLOW!");

    // Detecting the capabilities of the user's device!
    const hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);
    const hasAudio = app.hasSurfaceCapability(app.SurfaceCapabilities.AUDIO_OUTPUT);
    //console.log(`Screen: ${hasScreen}, Audio: ${hasAudio}!`);

    // Constants
    const userId = app.getUser() ? app.getUser().userId : ''; // Get the user's userID.

    const user_check_options = {
      url: `${hug_host}/create_user`,
      method: 'GET', // GET request, not POST.
      json: true,
      headers: {
        'User-Agent': 'Vote Goat Bot',
        'Content-Type': 'application/json'
      },
      qs: { // form instead of qs - because this is a GET request
        gg_id: userId, // Anonymous google id
        user_name: 'none_supplied',
        api_key: 'API_KEY'
      }
    };

    requestLib(user_check_options, (err, httpResponse, body) => {
      /*
        Workaround - we want to register accounts if they're new, no matter what intent the user invokes.
        Previously we requested user permission to retrieve their first name then forwarded them to the home intent, not good because they should be able to discover intents other than the home page.
      */
      if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
        const user_existed = body.user_existed;
        const created_user = body.created_user;

        if (user_existed == false && created_user == true) {
    		  console.log("Account created!");
        }

      } else { // Something went wrong with the POST request!
        console.log(err);
        console.log(httpResponse);
        console.log("Failed to check/create account!");
        serious_error_encountered(app);
      }
    });

    function welcome(app) {
      /*
      The welcome function is called from the end of the updatePermission (and userData) function.
      This greets the user, and suggests training & recommendation chips.
      If we're quiting the training section, we do not return here, rather the home/welcome intent created in dialogflow.

      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      const welcome_param = {}; // The dict which will hold our parameter data
      welcome_param['placeholder'] = 'placeholder'; // We need this placeholder
      app.setContext('home', 1, welcome_param); // We need to insert data into the 'home' context for the home fallback to trigger!

      let welcomeCard = app.buildRichResponse();

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

      welcomeCard.addSimpleResponse({
        speech: textToSpeech,
        displayText: `Hey, welcome to Vote Goat! ` +
          `Vote Goat aims to crowd source movie ratings & provide accurate movie recommendations. \n\n ` +
          `What would you like to do? \n\n ` +
          `🗳 Rank Movies? \n\n ` +
          `🤔 Get a Movie Recommendation? \n\n ` +
          `🏆 View your stats? \n\n ` +
          `🐐 View GOAT movies? \n\n ` +
          `📑 Or do you need help?`
      });

      if (hasScreen === true) {
        welcomeCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }

      app.ask(welcomeCard); // Sending the details to the user, awaiting input!

    }

    function menuFallback(app) {
      /*
      Fallback function for the main menu!
      Change the MENU_FALLBACK contents if you want different responses.
      */
      console.log("HOME SCREEN FALLBACK TRIGGERED!");

      const MENU_FALLBACK = [
        "Sorry, what do you want to do?",
        "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
      ];

      let current_fallback_speech = "<speak>" + MENU_FALLBACK[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = MENU_FALLBACK[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    function trainBot(app) {
      console.log("trainBot ran!");
      /*
      The trainBot function is the primary training function.
      A basic card is shown to the user, and they are asked if they like the contents of the card.
      The user is provided suggestion chips to pivot the discussion.
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      //const actor_parameter_data = req.body.result.parameters['actors'];
      var movie_genres_string;
      var movie_genres_parameter_data; // = req.body.result.parameters['voting']; // Workaround to get parameter values of 'list type'

      if (req.body.result.parameters['movieGenre']) {
        /*
        We detected that the user has manually entered the trainBot function.
        No loop was detected, we will attempt to retrieve the movie genres.
        If no movie genres are detected, we output a blank character.
        */
        console.log("User ran the trainBot function & the movieGenre parameter was read!");

        movie_genres_parameter_data = req.body.result.parameters['movieGenre']; // Workaround to get parameter values of 'list type'

        if (Array.isArray(movie_genres_parameter_data)) {
          // Verifying that the parameter data (which is a list) is stored in an array (workaround)
          const quantity_genres = movie_genres_parameter_data.length;

          if (quantity_genres > 0) {
            // Genres are actually present in the user's input
            movie_genres_string = movie_genres_parameter_data.join(' '); // Merge into a string for GET request
            app.setContext('forward_genre', 1, { // Setting the 'forward_genre' context for the next loop
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
        } else {
          // Our workaround no longer works
          small_error_encountered(app);
        }
      } else {
        /*
        The user just looped back into the trainBot function after voting.
        Since they looped back in, we want to retrieve the stored genre data!
        Only triggers upon loop; won't trigger on first run!
        */
        //console.log(`DID YOU JUST COME FROM A LOOP?!`);

        if (app.getContextArgument('forward_genre_more', 'movieGenres')) {
          /*
          We're maintaining the genres the user input.
          This context will be active if the user came from 'plot spoilers'.
          */
          var past_movie_genres_more = app.getContextArgument('forward_genre_more', 'movieGenres').value;
          //console.log(`TEST: FORWARD_GENRE_MORE EXISTS! ${past_movie_genres_more}`);
          app.setContext('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
            "placeholder": "placeholder",
            "movieGenres": past_movie_genres_more
          });
          movie_genres_string = past_movie_genres_more;
        } else if (app.getContextArgument('forward_genre', 'movieGenres')) {
          /*
          We're maintaining the genres the user input.
          This context will be active if the user voted without clicking 'plot spoilers'.
          */
          var past_movie_genres = app.getContextArgument('forward_genre', 'movieGenres').value;
          //console.log(`TEST: FORWARD_GENRE EXISTS! ${past_movie_genres}`);
          app.setContext('forward_genre', 1, { // We're now looping the last input genre until the user provides a new set of parameters
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

      console.log(`requested genres: ${movie_genres_string}`);

      ////////////////////

      const options = {
        url: `${hug_host}/get_single_training_movie`,
        method: 'GET', // GET request, not POST.
        json: true,
        headers: {
          'User-Agent': 'Vote Goat Bot',
          'Content-Type': 'application/json'
        },
        qs: { // qs instead of form - because this is a GET request
          gg_id: userId, // Anonymous google id
          genres: movie_genres_string, // The user's genre input (Possibilities: ' ', 'genre', 'genre,genre,genre,...' strings)
          actors: ' ', // If we were to add actor search, we'd specify that here.
          api_key: 'API_KEY'
        }
      };

      requestLib(options, (err, httpResponse, body) => {
        if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!

          if (body.success === true && body.valid_key === true) {
            // Triggers if a movie was found.
            // Retrieving data from the 'get_single_training_movie' JSON request result
            const moviePlot = body.plot;
            const plot = (body.plot).replace('&', 'and');
            const year = body.year;
            const posterURL = body.poster_url;
            const movieTitle = (body.title).replace('&', 'and');
            const imdbRating = body.imdbRating;
            const movieID = body.imdbID;

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

            let genre_speech = '';
            let genre_text = '';
            if (genre_list.length > 1) {
              genre_speech = `${movieTitle}'s genres are: ${genre_list}. <break time="0.25s" /> `;
              genre_text = `Genres: ${genre_list}. \n\n`;
            } else {
              genre_speech = `${movieTitle} is a ${genre_list} film. <break time="0.25s" /> `;
              genre_text = `Genre: ${genre_list}. \n\n`;
            }

            app.setContext('vote_context', 1, { // Setting the mode for upvote/downvote to detect where we are!
              "mode": 'training', // Setting the mode for upvote/downvote to detect where we are!
              "movie": `${movieID}`, // Setting the displayed movie's imdbID into the voting context!
              "title": `${movieTitle}`, // Setting the displayed movie's imdbID into the voting context!
              "plot": `${plot}`,
              "year": `${year}`
            });

            let RichResponse = app.buildRichResponse();

            if (hasScreen === true) {
              RichResponse.addBasicCard(app.buildBasicCard()
                .setTitle(`${movieTitle} (${year})`)
                .setImage(`${posterURL}`, `${movieTitle}`)
                .addButton(`🍿 Look for "${movieTitle}" on Google Play?`, `https://play.google.com/store/search?q=${movieTitle}&c=movies`)
              );
              RichResponse.addSuggestions([`👍`, `👎`, `📜 plot spoilers`, `🤔 recommend me a movie`, '📑 Help', `🚪 Back`]);
              RichResponse.addSuggestionLink('📺 YouTube', `https://www.youtube.com/results?search_query=${movieTitle}+${year}`);
            }

            const textToSpeech = `<speak>` +
              `I found the movie ${movieTitle}. <break time="0.5s" /> ` +
              `Released in the year ${year}, it was directed by ${director_list} and currently has an IMDB rating of ${imdbRating} out of 10. <break time="0.35s" /> ` +
              `The cast of ${movieTitle} is primarily comprised of ${actor_list}. <break time="0.25s" /> ` +
              genre_speech +
              `Would you watch ${movieTitle}?` +
              `</speak>`;

            RichResponse.addSimpleResponse({
              speech: textToSpeech,
              displayText: `I found the movie "${movieTitle}". \n\n` +
                `Released in ${year}, it was directed by ${director_list} and it currently has an IMDB rating of ${imdbRating}/10. \n\n` +
                `The cast of ${movieTitle} is primarily comprised of ${actor_list}. \n\n` +
                genre_text +
                `Would you watch ${movieTitle}?`
            });

            app.ask(RichResponse); // FIRE!
          } else if (body.success === false && body.valid_key === true) {

            app.setContext('home', 1, { // Setting the mode for upvote/downvote to detect where we are!
              "placeholder": 'placeholder'
            });

            let noResultCard = app.buildRichResponse();

            const textToSpeech = `<speak>` +
              `Sorry, Vote Goat couldn't find any movies matching your exact request. Please try searching with less genres. <break time="0.5s" /> ` +
              `What do you want to do next? <break time="0.25s" /> ` +
              `Rank Movies? <break time="0.25s" /> ` +
              `Or do you need help using Vote Goat? <break time="0.25s" /> ` +
              `</speak>`;

            noResultCard.addSimpleResponse({
              speech: textToSpeech,
              displayText: `Sorry, Vote Goat couldn't find anything matching your request. Please try searching with less genres. \n\n ` +
                `What do you want to do next?`
            });

            if (hasScreen === true) {
              noResultCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`]);
            }

            app.ask(noResultCard); // Asking the user the above


          } else {
            // key invalid & success=true|false
            small_error_encountered(app);
          }

        } else { // There was a problem!
          console.log("ERROR: Trainbot - Error contacting HUG/Backend!");
          serious_error_encountered(app); // Minor failure handling
        } //End of the err&httpResponse if/else check
      })
    }

    function moreMovieDetails(app) {
      /*
      The purpose of the 'moreMovieDetails' function is to quickly provide more information to the user during the training phase.
      Uses a GET request, talks to HUG and is quite verbose.
      The plot was inserted into the card, as reading it aloud would be too disruptive.
      */
      if (app.getContextArgument('vote_context', 'mode')) {
        if (app.getContextArgument('forward_genre', 'movieGenres')) {
          /*
          We're maintaining the genres the user input.
          */
          const movie_genres_string = app.getContextArgument('forward_genre', 'movieGenres').value;
          console.log(`mMD - Setting 'forward_genre_more' to: ${movie_genres_string}`);
          app.setContext('forward_genre_more', 1, { // We're now looping the last input genre until the user provides a new set of parameters
            "placeholder": "placeholder",
            "movieGenres": movie_genres_string
          });
        } else {
          console.log(`forward_genre was not detected within mMD!`);
        }

        console.log("moreMovieDetails Running!");
        app.data.fallbackCount = 0; // Required for tracking fallback attempts! // Required for tracking fallback attempts!

        const requested_mode = app.getContextArgument('vote_context', 'mode').value; // Retrieving the expected voting mode (within a list, or during training)!
        const movie_imdb_id = app.getContextArgument('vote_context', 'movie').value; // Retrieving the movie we want to downvote!
        const movie_title = app.getContextArgument('vote_context', 'title').value; // Retrieving the title
        const movie_year = app.getContextArgument('vote_context', 'year').value; // Retrieving the plot
        let movie_plot = app.getContextArgument('vote_context', 'plot').value; // Retrieving the plot

        let intro_text = `Warning! ${movie_title} plot spoilers! `;
        let confirmation_text = `Would you watch "${movie_title}"?`;
        let additional_text = `I found the movie ${movie_title}`;
        let plot_minus_text = intro_text.length + confirmation_text.length + additional_text.length;
        let plot_text_limit = 635 - plot_minus_text; // Need to take the intro text length into account, not just the plot!

        if (movie_plot.length > plot_text_limit) {
          movie_plot = movie_plot.substring(0, plot_text_limit) + '...'; // Limiting the length of the plot, preventing invalidation of simple response!
        }

        app.setContext('moreMovieInfo', 1, { // We're setting a placeholder value to trigger the 'moreMovieInfo fallback'. Without, it won't trigger!
          "placeholder": "placeholder"
        });

        app.setContext('vote_context', 1, { // Specifying the data required to vote!
          "mode": requested_mode,
          "movie": movie_imdb_id
        });

        let RichResponse = app.buildRichResponse();

        const textToSpeech = `<speak>` +
          `Warning! ${movie_title} plot spoilers! <break time="0.75s" /> ` +
          `${movie_plot} <break time="1.5s" /> ` +
          `Now that you know the plot of ${movie_title}, would you consider watching it? <break time="0.35s" /> ` +
          `</speak>`;

        RichResponse.addSimpleResponse({
          speech: textToSpeech,
          displayText: `⚠️ Warning! "${movie_title}" plot spoilers! 🙉 \n\n` +
            `"${movie_plot}"`
        });

        if (hasScreen === true) {
          if (requested_mode === 'list_selection') {
            RichResponse.addSuggestions([`👍`, `👎`, '🗳 Rank Movies', '📑 Help', `🚪 Back`]);
          } else {
            RichResponse.addSuggestions([`👍`, `👎`, `🤔 recommend me a movie`, '📑 Help', `🚪 Back`]);
          }
          RichResponse.addSuggestionLink('📺 YouTube', `https://www.youtube.com/results?search_query=${movie_title}+${movie_year}`);
        }

        app.ask(RichResponse); // FIRE!
      } else {
        /*
        The 'vote_context' context is not present.
        */
        handle_no_contexts(app);
      }
    } // End of moreMoveDetails function!

    function voted(app) {
      /*
      Provides voting functionality.
      There used to be separate functions for up/down voting - refactored into a single function!
      */
      if (app.getContextArgument('vote_context', 'mode')) {
        const requested_mode = app.getContextArgument('vote_context', 'mode').value; // Retrieving the expected voting mode (within a list, or during training)!
        const movie_imdb_id = app.getContextArgument('vote_context', 'movie').value; // Retrieving the movie we want to downvote!
        const votes = req.body.result.parameters['voting']; // Workaround to get parameter values of 'list type'
        app.data.fallbackCount = 0; // Required for tracking fallback attempts!
        //console.log(`CHECK VOTES: ${votes}, IS IT AN ARRAY? ${Array.isArray(votes)}, LENGTH: ${votes.length}`);

        var voting_intention = 1; // Default is upvote! This could be simplified to 'var voting_intention;' perhaps.

        if (Array.isArray(votes)) { // Verifying that votes is an array

          console.log("START OF VOTE TALLY");
          /*
             'votes' is a list of upvote/downvote entries
             There can be several positive/negative terms provided.
             We want to determine if what the user said was majoritively positive/negative.
          */
          const quantity_votes = votes.length;
          if (quantity_votes > 0) {
            // Good, we heard the user voting!

            let upvotes = 0; // Quantity of upvotes in the votes list
            let downvotes = 0; // Quantity of downvotes in the votes list

            // Let's count the occurrences of upvote & downvote in the voting_array
            for (var index = 0; index < quantity_votes; index++) {
              if (votes[index] === 'upvote') {
                upvotes++; // increment!
              } else if (votes[index] === 'downvote') {
                downvotes++; // increment!
              } else {
                /*
                This section of code should never trigger.
                */
                console.log(`Why is ${votes[index]} present?!`);
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
            rating: voting_intention, // The rating we're setting for the movie we just displayed to the user.
            mode: requested_mode,
            api_key: 'API_KEY'
          }
        };

        requestLib(options, (err, httpResponse, body) => {
          if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
            if (requested_mode === 'training') {
              /*
              Detect if the user is in the training mode, if so, loop them!
              */

              trainBot(app); // We recursively send them to the primary trainBot function.
            } else if (requested_mode === 'list_selection') {
              /*
              User voted from within the movie recommendation section.
              We want to provide them an appropriate response & prompt them for the next step.
              */
              let PostRecommendPrompt = app.buildRichResponse();
              var textToSpeech;
              var speechToText;

              if (voting_intention == 1) {
                const movie_title = app.getContextArgument('vote_context', 'title').value; // Retrieving the expected voting mode (within a list, or during training)!

                if (hasScreen === true) {
                  // Device has a screen
                  textToSpeech = `<speak>` +
                    `Huzzah, a successful movie recommendation! <break time="0.25s" /> ` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store. <break time="0.5s" /> ` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?` +
                    `</speak>`;
                  speechToText = `🎉 Huzzah, a successful movie recommendation! 🎊 \n\n` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store. \n\n` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?`;
                } else {
                  // Device is speaker only
                  textToSpeech = `<speak>` +
                    `Huzzah, a successful movie recommendation! <break time="0.25s" /> ` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store. <break time="0.5s" /> ` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?` +
                    `</speak>`;
                  speechToText = `Huzzah, a successful movie recommendation!` +
                    `Try looking for ${movie_title} on YouTube or the Google Play store.` +
                    `What do you want to do next? Rank movies, get another movie recommendation or quit?`;
                }
                //app.tell(`Huzzah, a successful movie recommendation! Try looking for ${movie_title} on YouTube or the Google Play store. Goodbye.`);
              } else {
                // This could be improved greatly by providing 3 random liked movies as an apology.

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
                //app.tell(`Sorry for providing poor movie recommendations, please try ranking more movies to receive better movie suggestions. Goodbye.`);
              }

              PostRecommendPrompt.addSimpleResponse({
                speech: textToSpeech,
                displayText: speechToText
              });

              if (hasScreen === true) {
                // Retrieving the user's survey code (userID!)
                const user_code_options = {
                  url: `${hug_host}/get_user_code`,
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

                requestLib(user_code_options, (err_code, httpResponse_code, body_code) => {
                  if (!err_code && httpResponse_code.statusCode == 200) { // Check that the GET request didn't encounter any issues!
                    if (body_code.success === true && body_code.valid_key === true) {
                      //let user_code = body_code.code; // Getting the user's userID which will be used as their pincode!
                      //console.log(`within request id: ${user_code}`);

                      //const surveyLink = `https://docs.google.com/forms/d/e/1FAIpQLScohZKq_ACe3AK79Ok4cVKYcZ1dwHnmzCMdILaD8R5bytXHOw/viewform?usp=pp_url&entry.1196748907=${user_code}&entry.1711929638&entry.46740867&entry.2126415349`;

                      //PostRecommendPrompt.addBasicCard(app.buildBasicCard(`Please fill out the following survey about movie Google assistants.`)
                      //  .setTitle(`Please consider completing the following survey.`)
                      //  .addButton(`📝 Quick 'Google Form' survey`, surveyLink)
                      //);
                      //PostRecommendPrompt.addSuggestionLink('📝 Quick Survey', surveyLink);

                      if (voting_intention == 1) {
                        PostRecommendPrompt.addSuggestions(['🗳 Rank Movies', '🤔 recommend me a movie', '🏆 Show Stats', `🚪 Quit`]);
                      } else {
                        PostRecommendPrompt.addSuggestions(['🗳 Rank Movies', '🏆 Show Stats', `🚪 Quit`]);
                      }

                      app.setContext('final_prompt', 1, {
                        'placeholder': 'placeholder',
                        'voting_intention': voting_intention
                      });

                      app.ask(PostRecommendPrompt); // FIRE!

                    } else {
                      small_error_encountered(app); // Something went wrong.. hopefully not!
                    }
                  } else {
                    serious_error_encountered(app); // Something went horrible wrong.. hopefully not!
                  }
                })

              } else {
                /*
                The device is a speaker.
                We don't provide them the card nor suggestion chips.
                */
                app.setContext('final_prompt', 1, {
                  'placeholder': 'placeholder',
                  'voting_intention': voting_intention
                });

                app.ask(PostRecommendPrompt); // FIRE!
              }
            } else {
              console.log('An error was encountered in upvote function');
              small_error_encountered(app); // Minor failure handling
            }
          } else {
            console.log('An error was encountered in downvote function');
            small_error_encountered(app); // Minor failure handling
          }
        })
      } else {
        // No 'vote_cotext' context detected!
        handle_no_contexts(app);
      }
    }

    function retrieveID(gg_id_input) {
      const user_code_options = {
        url: `${hug_host}/get_user_code`,
        method: 'GET', // GET request, not POST.
        json: true,
        headers: {
          'User-Agent': 'Vote Goat Bot',
          'Content-Type': 'application/json'
        },
        qs: { // qs instead of form - because this is a GET request
          gg_id: gg_id_input, // Anonymous google id
          api_key: 'API_KEY'
        }
      };

      requestLib(user_code_options, (err_code, httpResponse_code, body_code) => {
        if (!err_code && httpResponse_code.statusCode == 200) { // Check that the GET request didn't encounter any issues!
          if (body_code.success === true && body_code.valid_key === true) {
            return JSON.parse(body_code.code); // Getting the user's userID which will be used as their pincode!
          } else {
            return 0;
          }
        } else {
          return 0;
        }
      })
    }

    function finalPromptFallback(app) {
      /*
      Fallback function for the final recommendation prompt.
      For some reason, the 'voting'
      */
      console.log("FINAL RECOMMENDATION FALLBACK TRIGGERED!");

      let FP_FALLBACK = [
        "Sorry, what do you want to do next?",
        "Sorry, I didn't catch that. What do you want to do next? Rank movies, view your stats, get help using Vote Goat or quit altogether?",
        "Sorry, I don't know what you want to do next. Do you want to rank more movies, view your stats, get help using Vote Goat or quit altogether?"
      ];

      let current_fallback_speech = "<speak>" + FP_FALLBACK[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = FP_FALLBACK[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    function votingFallback(app) {
      /*
      Fallback function for the voting mechanisms!
      Change the VOTING_FALLBACK contents if you want different responses.
      */
      console.log("VOTING FALLBACK TRIGGERED!");
      var VOTING_FALLBACK = ``;

      if (app.getContextArgument('vote_context', 'title')) {
        const movie_title = app.getContextArgument('vote_context', 'title').value; // Retrieving the title from the 'vote_context' context

        VOTING_FALLBACK = [
          `Sorry, what was that?`,
          `Sorry, I didn't catch that, would you watch ${movie_title}?`,
          `I'm sorry, I didn't understand that. Would you cosider watching ${movie_title}?`
        ];
      } else {
        // This should NEVER trigger, however better safe than sorry!
        handle_no_contexts(app);
      }

      let current_fallback_speech = "<speak>" + VOTING_FALLBACK[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = VOTING_FALLBACK[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions([`👍`, `👎`, `📜 plot spoilers`, '📑 Help', `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    function recommendMovie(app) {
      /*
      Placeholder for the end 'recommend me' function!
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      const check_quantity_user_votes = {
        url: `${hug_host}/get_user_ranking`,
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
          if (body.success === true && body.valid_key === true) { // The returned JSON was successful & a valid API key was used.

            if (body.total_movie_votes >= 5) {
              /*
              The user has ranked enough movies to receive a movie recommendation!
              5 isn't a final proven minimum vote count.
              */
              const check_ab_value_options = {
                url: `${hug_host}/get_ab_value`,
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

              requestLib(check_ab_value_options, (ab_err, ab_httpResponse, ab_body) => {
                if (!ab_err && ab_httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
                  if (ab_body.success === true && ab_body.valid_key === true) {
                    var ab_value = ab_body.ab_value // Either 0 or 1
                    var options; // Declaring the options var ahead of the following if statement

                    if (ab_value === 1) {
                      options = {
                        //url: `${hug_nn_host}/get_nn_list`, // SWITCH FOR MOVIE RECOMMENDATIONS!
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
                    } else {
                      options = {
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
                    }

                    requestLib(options, (err, httpResponse, body) => {
                      if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
                        if (body[0].success === true && body[0].valid_key === true) {
                          const quantity_top_k = body.length; // NOT PROVEN! Get the quantity of movies in top-k results.

                          if (quantity_top_k > 0) {

                            let movie_list = []; // Where we'll store the list elements
                            const parameters = {}; // Creating parameter placeholder

                            for (var index = 0; index < quantity_top_k; index++) {
                              /*
                              Given the quantity of movies returned in the JSON (eventually top-k movies),
                              produce the 'buildOptionItem' element and store it in the 'movie_list' list.
                              */
                              const index_value = index.toString(); // Creating string representation of index for context data
                              parameters[index_value] = body[index]; // Inserting the 'get_random_movie_list' body contents into the context parameter.

                              const current_movieTitle = body[index].title;
                              const current_movieYear = body[index].year;
                              const current_posterURL = body[index].poster_url;
                              //console.log(`${index}, ${current_movieTitle}, ${current_movieYear}, ${current_moviePlot}, ${current_posterURL}`);

                              movie_list[index] = app.buildOptionItem(index_value, [`${current_movieTitle}`]) // Synonyms for the movie. We just use the movie title for now, we provide alternative language entries?
                                .setTitle(`${current_movieTitle}`) // Setting the list element's title //(${current_movieYear})
                                .setImage(`${current_posterURL}`, `${current_movieTitle}`); // Squishing the poster into a 40x40 image.

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

                          } else {
                            console.log("recommendMovie: No movies were returned! Movies SHOULD have been returned!");
                            serious_error_encountered(app); // Abaondon ship!
                          }
                        } else if (body.success === false && body.valid_key === true) {
                          /*
                          In this case, the user has had their movie ratings filtered out during the NN calculation!
                          We want to handle this appropriately, similar to when they hadn't ranked enough movies!
                          */
                          let UserLacksNNVotes = app.buildRichResponse();

                          const textToSpeech = `<speak>` +
                            `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. <break time="0.75s" /> ` +
                            `The more movies you rank the better Vote Goat's movie recommendations become! ` +
                            `Do you want to rank movies? <break time="0.25s" /> Or do you require help using Vote Goat?` +
                            `</speak>`;

                          const textToDisplay = `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. \n\n` +
                            `The more movies you rank the better Vote Goat's movie recommendations become! \n\n` +
                            `Do you want to rank movies? Or do you require help using Vote Goat?`;

                          UserLacksNNVotes.addSimpleResponse({
                            speech: textToSpeech,
                            displayText: textToDisplay
                          });

                          if (hasScreen === true) {
                            UserLacksNNVotes.addSuggestions(['🗳 Rank Movies', '📑 Help']);
                          }

                          app.ask(UserLacksNNVotes); // FIRE!
                        } else {
                          console.log("ERROR: RecommendMe function => failure | invalid key!");
                          serious_error_encountered(app); // Abandon ship!
                        }
                      } else {
                        // SOMETHING WENT TERRIBLY WRONG!
                        console.log("recommendMovie: An error (err/http) was encountered! Error: ${err}");
                        serious_error_encountered(app); // Abandon ship!
                      }
                    }) // END of the GET request!

                  } else {
                    // AB TESTING ERR
                    small_error_encountered(app)
                  }
                } else {
                  // AB TESTING ERR
                  serious_error_encountered(app)
                }
              })

            } else {
              /*
              The user hasn't ranked enough movies to produce a recommendation.
              The minimum of 5 movies is a random value, perhaps it should be higher but 5 is better than 0 at least.
              */
              let UserLacksVotes = app.buildRichResponse();

              let votes_required = 5 - body.total_movie_votes; // How many more votes are required to meet the minimum votes?

              const textToSpeech = `<speak>` +
                `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. <break time="0.75s" /> ` +
                `Please rank at least ${votes_required} more movies; the more movies you rank the better Vote Goat's movie recommendations become! ` +
                `Do you want to rank movies? <break time="0.25s" /> Or do you require help using Vote Goat?` +
                `</speak>`;

              const textToDisplay = `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. \n\n` +
                `Please rank at least ${votes_required} more movies; the more movies you rank the better Vote Goat's movie recommendations become! \n\n` +
                `Do you want to rank movies? Or do you require help using Vote Goat?`;

              UserLacksVotes.addSimpleResponse({
                speech: textToSpeech,
                displayText: textToDisplay
              });

              if (hasScreen === true) {
                UserLacksVotes.addSuggestions(['🗳 Rank Movies', '📑 Help']);
              }

              app.ask(UserLacksVotes); // FIRE!
            }

          } else if (body.success === false && body.valid_key === true) {
            /*
            Duplicate check! The user hasn't ranked any movies yet.
            Minimum ranking quantity = 5!
            Ideally, we'd reduce the duplicate code, but we're pushed for time.
            */
            let UserLacksVotes = app.buildRichResponse();

            let votes_required = 5 - body.total_movie_votes; // How many more votes are required to meet the minimum votes?

            const textToSpeech = `<speak>` +
              `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. <break time="0.75s" /> ` +
              `Please rank at least ${votes_required} more movies; the more movies you rank the better Vote Goat's movie recommendations become! ` +
              `Do you want to rank movies? <break time="0.25s" /> Or do you require help using Vote Goat?` +
              `</speak>`;

            const textToDisplay = `Unfortunately you've not ranked enough movies for Vote Goat to provide an accurate movie recommendation. \n\n` +
              `Please rank at least ${votes_required} more movies; the more movies you rank the better Vote Goat's movie recommendations become! \n\n` +
              `Do you want to rank movies? Or do you require help using Vote Goat?`;

            UserLacksVotes.addSimpleResponse({
              speech: textToSpeech,
              displayText: textToDisplay
            });

            if (hasScreen === true) {
              UserLacksVotes.addSuggestions(['🗳 Rank Movies', '📑 Help']);
            }

            app.ask(UserLacksVotes); // FIRE!
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

    function dislikeRecommendations(app) {
      /*
      Erasing the contexts then sending users to training mode!
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      console.log("USER Disliked all recommendations!");
      if (app.getContextArgument('list_body', '0')) {
        var iterator_max;
        if (hasScreen === true) {
          iterator_max = 9;
        } else {
          // For speakers, skipping submitting bad ratings to movies 3-9 (not displayed to them).
          iterator_max = 2;
        }

        for (var iterator = 0; iterator < 10; iterator++) { // Iterating over the top k body results!

          if (iterator > iterator_max) {
            continue; // Greater than 9 is invalid.
          } else {
            let string_iterator = iterator.toString();
            let movie_element = app.getContextArgument('list_body', string_iterator).value;
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

        let mass_downvote = app.buildRichResponse();
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

        mass_downvote.addSimpleResponse({
          speech: textToSpeech,
          displayText: speechToText
        });

        if (hasScreen === true) {
          mass_downvote.addSuggestions(['🗳 Rank Movies', '🏆 Show Stats', `🚪 Quit`]);
        }

        app.setContext('final_prompt', 1, {
          'placeholder': 'placeholder',
          'voting_intention': 0
        });

        app.ask(mass_downvote); // FIRE!

      } else {
        // This shouldn't trigger, but better safer than sorry!
        handle_no_contexts(app);
      }
    }

    function dislikeRecommendationsFallback(app) {
      /*
      Fallback function for the GOAT intent!
      */
      console.log("Disliked All Recommendations FALLBACK TRIGGERED!");

      const HELP_FALLBACK_DATA = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want to rank movies, get another recommendation, view your stats, get the GOAT movie lists, or quit?",
        "I'm having trouble understanding. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time? Or want to quit?"
      ];

      let current_fallback_speech = "<speak>" + HELP_FALLBACK_DATA[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = HELP_FALLBACK_DATA[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    function itemSelected(app) {
      /*
      Code from: https://developers.google.com/actions/assistant/helpers#getting_the_results_of_the_helper_1
      Get & compare the user's selections to each of the item's keys
      The param is set to the index when looping over the results to create the addItems contents.
      */
      if (app.getContextArgument('list_body', '0')) {
        console.log("INSIDE: itemSelected");
        const param = app.getSelectedOption(); // Getting the clicked list item!
        var movie_element; // Where we'll store the JSON details of the clicked item!

        app.data.fallbackCount = 0; // Required for tracking fallback attempts!

        if (!param) {
          // How did they manage this? Let's kick them out!
          app.tell('You did not select any item from the list or carousel, for safety the bot will quit.');
        } else if (param === '0') {
          //reduce_itemSelected(app, '0');
          movie_element = app.getContextArgument('list_body', '0').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '1') {
          //reduce_itemSelected(app, '1');
          movie_element = app.getContextArgument('list_body', '1').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '2') {
          //reduce_itemSelected(app, '2');
          movie_element = app.getContextArgument('list_body', '2').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '3') {
          //reduce_itemSelected(app, '3');
          movie_element = app.getContextArgument('list_body', '3').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '4') {
          //reduce_itemSelected(app, '4');
          movie_element = app.getContextArgument('list_body', '4').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '5') {
          //reduce_itemSelected(app, '5');
          movie_element = app.getContextArgument('list_body', '5').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '6') {
          //reduce_itemSelected(app, '6');
          movie_element = app.getContextArgument('list_body', '6').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '7') {
          //reduce_itemSelected(app, '7');
          movie_element = app.getContextArgument('list_body', '7').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '8') {
          //reduce_itemSelected(app, '8');
          movie_element = app.getContextArgument('list_body', '8').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else if (param === '9') {
          //reduce_itemSelected(app, '9');
          movie_element = app.getContextArgument('list_body', '9').value; // We're grabbing the movie_list from the recommendMovie function, via its output context!
        } else {
          // They somehow clicked on something not in the carousel, abandon ship!
          app.tell('You selected an unknown item from the list or carousel, for safety the bot will quit.');
          //small_error_encountered(app); // Abandon ship!
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

        app.setContext('recommend_movie_context', 0, { // Duration 0 to erase the context!
          "placeholder": "placeholder",
          "repeatedRichResponse": "", // Erasing context!
          "repeatedCarousel": "" // Erasing context!
        });

        app.setContext('item_selected_context', 1, { // Placeholder to initialize/trigger the 'item_selected_context' context.
          "placeholder": "placeholder"
        });
        var title_var = (movie_element.title).replace('&', 'and'); // & characters invalidate SSML
        var plot_var = (movie_element.plot).replace('&', 'and'); // & characters invalidate SSML

        app.setContext('vote_context', 1, { // Setting the mode for upvote/downvote to detect where we are!
          "mode": 'list_selection', // Setting the mode for upvote/downvote to detect where we are!
          "movie": `${movie_element.imdbID}`, // Setting the displayed movie's imdbID into the voting context!
          "title": `${movie_element.title}`, // Setting the displayed movie's imdbID into the voting context!
          "plot": `${movie_element.plot}`, // Getting the plot from the selected movie
          "year": `${movie_element.year}` // Placing the year value into the voting context!
        });

        let genres = movie_element.genres; // NOT CONST! Because we want to potentially edit the last element to 'and genre'

        if (Array.isArray(genres)) {
          const quantity_genres = genres.length; // Quantity of genres in the genre array
          if (quantity_genres > 1) { // More than one genre? Engage!
            genres[quantity_genres - 1] = 'and ' + genres[quantity_genres - 1]; // We're setting the last actor array element to 'and <actor>'
          }
        }
        const genre_list = (genres.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

        let actors = movie_element.actors; // NOT CONST! Because we want to potentially edit the last element to 'and actorname'
        if (Array.isArray(actors)) {
          const quantity_actors = actors.length; // Quantity of actors in the actor array
          if (quantity_actors > 1) { // More than one actor? Engage!
            actors[quantity_actors - 1] = 'and ' + actors[quantity_actors - 1]; // We're setting the last actor array element to 'and <actor>'
          }
        }
        const actor_list = (actors.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

        let directors = movie_element.director;
        if (Array.isArray(directors)) {
          const quantity_directors = directors.length;
          if (quantity_directors > 1) { // More than one director? Engage!
            directors[quantity_directors - 1] = 'and ' + directors[quantity_directors - 1]; // We're setting the last director array element to 'and <director>'
          }
        }
        const director_list = (directors.join(', ')).replace(', and', ' and'); // Merge into a string, optimize gramar.

        var RichResponse = app.buildRichResponse();

        let genre_speech = '';
        let genre_text = '';
        if (genre_list.length > 1) {
          genre_speech = `${title_var}'s genres are: ${genre_list}. <break time="0.25s" /> `;
          genre_text = `Genres: ${genre_list}.`;
        } else {
          genre_speech = `${title_var} is a ${genre_list} film. <break time="0.25s" /> `;
          genre_text = `Genre: ${genre_list}.`;
        }

        if (hasScreen === true) {
          RichResponse.addBasicCard(app.buildBasicCard()
            .setTitle(`${movie_element.title} (${movie_element.year})`)
            .addButton(`🍿 Look for "${movie_element.title}" on Google Play?`, `https://play.google.com/store/search?q=${movie_element.title}&c=movies`)
            .setImage(`${movie_element.poster_url}`, `${movie_element.title}`)
          );
        }

        const textToSpeech = `<speak>` +
          `${title_var} was released in ${movie_element.year}, it was directed by ${director_list} and it currently has an IMDB rating of ${movie_element.imdbRating} out of 10. <break time="0.35s" /> ` +
          `The cast of ${title_var} is primarily comprised of ${actor_list}. <break time="0.35s" /> ` +
          genre_speech +
          `</speak>`;

        RichResponse.addSimpleResponse({
          speech: textToSpeech,
          displayText: `"${title_var}" was released in ${movie_element.year}, it was directed by ${director_list} and it currently has an IMDB rating of ${movie_element.imdbRating}/10. \n\n` +
            `The cast of ${title_var} is primarily comprised of ${actor_list}. \n\n` +
            genre_text
        });

        RichResponse.addSimpleResponse({
          speech: `Are you interested in watching ${title_var}?`,
          displayText: `Are you interested in watching ${title_var}?`
        });

        if (hasScreen === true) {
          RichResponse.addSuggestions([`👍`, `👎`, `📜 plot spoilers`, '🗳 Rank Movies', '🏆 Show Stats', '📑 Help', `🚪 Back`]);
          RichResponse.addSuggestionLink('📺 YouTube Trailer', `https://www.youtube.com/results?search_query=${movie_element.title}+${movie_element.year}+trailer`);
        }
        app.ask(RichResponse); // FIRE!
      } else {
        // Shouldn't happen, but better safe than sorry!
        handle_no_contexts(app);
      }
    } // end of itemSelected function!


    function listFallback(app) {
      /*
      Fallback function for the voting mechanisms!
      Change the CAROUSEL_FALLBACK contents if you want different responses.
      */
      console.log("RECOMMEND FALLBACK TRIGGERED!");
      if (app.getContextArgument('recommend_movie_context', 'placeholder') && app.getContextArgument('list_body', '0')) {
        let carousel = app.getContextArgument('recommend_movie_context', 'repeatedCarousel').value;

        let first_movie = app.getContextArgument('list_body', '0').value; // Grabbing the first movie_element
        let second_movie = app.getContextArgument('list_body', '1').value; // Grabbing the second movie_element
        let third_movie = app.getContextArgument('list_body', '2').value; // Grabbing the third movie_element

        var CAROUSEL_FALLBACK_DATA;
        if (hasScreen === true) {
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
        let current_fallback_phrase = CAROUSEL_FALLBACK_DATA[app.data.fallbackCount];

        app.data.fallbackCount = parseInt(app.data.fallbackCount, 10); // Retrieve the value of the intent's fallback counter
        app.data.fallbackCount++; // Iterate the fallback counter

        if (app.data.fallbackCount > 3) {
          app.tell("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
        } else {
          console.log("HANDLED FALLBACK!");
          app.askWithCarousel(current_fallback_phrase, carousel);
        }
      } else {
        // Shouldn't occur, but better safe than sorry.
        handle_no_contexts(app);
      }
    }

    function handleFallback(app, callback) {
      /*
      https://developers.google.com/actions/assistant/best-practices#provide_helpful_reprompts_and_fail_gracefully
      Function called by each of the main intent's fallback functions.
      Modified to actually work.
      Used to limit the fallback attempts to 3; more than 3 doesn't work (Their documentation says something about a bug).
      */
      console.log("HANDLING FALLBACK!");
      app.data.fallbackCount = parseInt(app.data.fallbackCount, 10); // Retrieve the value of the intent's fallback counter
      app.data.fallbackCount++; // Iterate the fallback counter

      if (app.data.fallbackCount > 3) {
        app.tell("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
      } else {
        console.log("HANDLED FALLBACK!");
        callback(); // Run the app.ask
      }
    }

    function small_error_encountered(app) {
      /*
      Generally used when there's a small illogical error.
      */
      app.tell("An unexpected error was encountered! Let's end our Vote Goat session for now.");
    }

    function serious_error_encountered(app) {
      /*
      This error message is used when serious issues occur, such as those caused by back-end server failure.
      */
      app.tell("An unexpected serious error was encountered! Let's end our Vote Goat session for now.");
    }

    function goodbye(app) {
      /*
      Elaborate goodbye intent, attempts to use rich responses in the
      */
      let GoodbyeRichResponse = app.buildRichResponse();
      var textToSpeech; // Initializing the tts contents
      var speechToText; // Initializing the appropriate text contents
      //var user_code;

      if (hasScreen === true) {
        // Device has a screen
        textToSpeech = `<speak>` +
          //`I heard you want to leave? <break time="0.35s" /> ` +
          //`If you've got time to spare, please consider completing the following survey about your Vote Goat experience. <break time="0.35s" /> ` +
          `Leaving Vote Goat, goodbye.` +
          `</speak>`;
        //speechToText = `I heard you want to leave? \n\n ` +
        //  `If you've got time to spare, please consider completing the following survey about your Vote Goat experience. \n\n ` +

        speechToText = `Leaving Vote Goat now, goodbye.`;
      } else {
        // Device is speaker only
        textToSpeech = `<speak>` +
          `Sorry to see you go, come back soon? <break time="0.35s" /> ` +
          `Goodbye.` +
          `</speak>`;
        speechToText = `Sorry to see you go, come back soon? \n\n` +
          `Goodbye.`;
      }

      GoodbyeRichResponse.addSimpleResponse({
        speech: textToSpeech,
        displayText: speechToText
      });

      if (hasScreen === true) {
        // Retrieving the user's survey code (userID!)
        const user_code_options = {
          url: `${hug_host}/get_user_code`,
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

        requestLib(user_code_options, (err_code, httpResponse_code, body_code) => {
          if (!err_code && httpResponse_code.statusCode == 200) { // Check that the GET request didn't encounter any issues!
            if (body_code.success === true && body_code.valid_key === true) {
              //user_code = 0
              //let user_code = body_code.code; // Getting the user's userID which will be used as their pincode!
              //console.log(`within request id: ${user_code}`);

              //const surveyLink = `https://docs.google.com/forms/d/e/1FAIpQLScohZKq_ACe3AK79Ok4cVKYcZ1dwHnmzCMdILaD8R5bytXHOw/viewform?usp=pp_url&entry.1196748907=${user_code}&entry.1711929638&entry.46740867&entry.2126415349`;

              //PostRecommendPrompt.addBasicCard(app.buildBasicCard(`Please fill out the following survey about movie Google assistants.`)
              //  .setTitle(`Please consider completing the following survey.`)
              //  .addButton(`📝 Quick 'Google Form' survey`, surveyLink)
              //);

              app.tell(GoodbyeRichResponse); // FIRE!

            } else {
              small_error_encountered(app); // Something went wrong.. hopefully not!
            }
          } else {
            serious_error_encountered(app); // Something went horrible wrong.. hopefully not!
          }
        })

      } else {
        /*
        The device is a speaker.
        We won't provide them basic card details.
        */
        app.tell(GoodbyeRichResponse); // FIRE!
      }
    }

    function getLeaderboard(app) {
      /*
        We want to gamify the bot, so that we encourage people to vote as much as possible.
        The more voting data we have, the better recommendations we can provide to everyone!
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      const options = {
        url: `${hug_host}/get_user_ranking`,
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

      requestLib(options, (err, httpResponse, body) => {
        if (!err && httpResponse.statusCode == 200) { // Check that the GET request didn't encounter any issues!
          if (body.success === true && body.valid_key === true) {

            var RichResponse = app.buildRichResponse();
            var textToSpeech;

            if (body.total_movie_votes > 0) {
              textToSpeech = `<speak>` +
                `You're currently ranked <say-as interpret-as="ordinal">${body.movie_leaderboard_ranking}</say-as> out of ${body.quantity_users} users! <break time="0.5s" /> ` +
                `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! <break time="1.5s" /> ` +
                `What do you want to do next? Rank Movies, or get a Movie Recommendation? <break time="0.25s" /> ` +
                `</speak>`;
            } else {
              textToSpeech = `<speak>` +
                `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
                `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> ` +
                `</speak>`;
            }


            RichResponse.addSimpleResponse({
              speech: textToSpeech,
              displayText: `You're currently ranked ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users! \n\n ` +
                `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! \n\n ` +
                `What do you want to do next? Rank Movies, or get a Movie Recommendation?`
            });

            if (hasScreen === true) {
              RichResponse.addBasicCard(app.buildBasicCard(`🗳 Keep ranking movies to improve your leaderboard position! Note that 30 days of inactivity will wipe your statistics!`)
                .setTitle(`You're rank ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users!`)
              );

              RichResponse.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendations', '📑 Help', '🚪 quit']);
            }

            app.ask(RichResponse); // FIRE!

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
    }

    function getLeaderboardFallback(app) {
      /*
      Fallback function for the leaderboards!
      */
      console.log("LEADERBOARD FALLBACK TRIGGERED!");

      const LEADERBOARD_FALLBACK_DATA = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
      ];

      let current_fallback_speech = "<speak>" + LEADERBOARD_FALLBACK_DATA[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = LEADERBOARD_FALLBACK_DATA[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

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

    function getgoatFallback(app) {
      /*
      Fallback function for the GOAT intent!
      */
      console.log("GOAT FALLBACK TRIGGERED!");

      const GOAT_FALLBACK_DATA = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or get help using Vote Goat?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or learn how to use Vote Goat?"
      ];

      let current_fallback_speech = "<speak>" + GOAT_FALLBACK_DATA[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = GOAT_FALLBACK_DATA[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });


      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', '📑 Help', `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }


    function getHelpAnywhere(app) {
      /*
      Provides the user the ability to get help anywhere they are in the bot.
      Pretty much a duplicate of the welcome/home function, minus the greeting!
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      const help_anywhere_parameter = {}; // The dict which will hold our parameter data
      help_anywhere_parameter['placeholder'] = 'placeholder'; // We need this placeholder
      app.setContext('help_anywhere', 1, help_anywhere_parameter); // We need to insert data into the 'home' context for the home fallback to trigger!

      let helpCard = app.buildRichResponse();

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

      helpCard.addSimpleResponse({
        speech: textToSpeech,
        displayText: `I heard you're having some problems with Vote Goat? \n\n` +
                     `You can rank movies by saying Rank Movies. \n\n` +
                     `You can get personal movie recommendations by saying Recommend me a movie. \n\n` +
                     `You can get your stats by saying Get Stats. \n\n` +
                     `You can get a list of the greatest horror movies of all time by saying show me goat horror movies.`
      });

      helpCard.addSimpleResponse({
        speech: textToSpeech2,
        displayText: `When ranking movies, you can ask for plot spoilers. \n\n` +
                     `You can specify the genre of movies to rank by saying rank funny scary movies. \n\n` +
                     `What do you want to do next? Rank Movies, or get a Movie Recommendation?`
      });

      if (hasScreen === true) {
        let possible_genres = "Action, Romantic, Animation, Fantasy, Adventure, Comedy, Sci-Fi, Crime, Documentary, Drama, Family, Film-Noir, Horror, Musical, Mystery, Short, Thriller, War, Western, Biography & Sport";
        helpCard.addBasicCard(app.buildBasicCard(`${possible_genres}`)
          .setTitle(`🎥 Supported Movie Genres`)
        );
        helpCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🚪 Quit`]);
      }

      app.ask(helpCard); // Sending the details to the user, awaiting input!
    }

    function getHelpFallback(app) {
      /*
      Fallback function for the GOAT intent!
      */
      console.log("HELP FALLBACK TRIGGERED!");

      const HELP_FALLBACK_DATA = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
      ];

      let current_fallback_speech = "<speak>" + HELP_FALLBACK_DATA[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = HELP_FALLBACK_DATA[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, `🚪 Quit`]);
      }
      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    function handle_no_contexts(app) {
      /*
      Any ghost contexts shall never haunt us again!
      We shall catch cases where the user got to an intent when they shouldn't have.
      Shouldn't be neccessary with correct dialogflow input contexts... :(
      */
      app.data.fallbackCount = 0; // Required for tracking fallback attempts!

      let no_context_card = app.buildRichResponse();

      const textToSpeech = `<speak>` +
        `Sorry, you've taken the wrong turn. <break time="0.5s" /> ` +
        `What would you like to do instead? <break time="0.25s" /> ` +
        `Rank Movies? <break time="0.25s" /> ` +
        `Get a Movie Recommendation? <break time="0.25s" /> ` +
        `View your stats? <break time="0.25s" /> ` +
        `View the Greated movies of all time? <break time="0.25s" /> ` +
        `Or do you need help? <break time="0.25s" /> ` +
        `</speak>`;

      no_context_card.addSimpleResponse({
        speech: textToSpeech,
        displayText: `Sorry, you've taken the wrong turn.! \n\n ` +
                     `What would you like to do instead? \n\n ` +
                     `🗳 Rank Movies? \n\n ` +
                     `🤔 Get a Movie Recommendation? \n\n ` +
                     `🏆 View your stats? \n\n ` +
                     `🐐 View GOAT movies? \n\n ` +
                     `📑 Or do you need help?`
      });

      if (hasScreen === true) {
        no_context_card.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }

      app.setContext('handle_no_contexts', 1, {
        "placeholder": "placeholder"
      });

      app.ask(no_context_card); // FIRE!
    }

    function handleNoContextsFallback(app) {
      /*
      Fallback function for the GOAT intent!
      */
      console.log("HANDLE NO CONTEXTS FALLBACK TRIGGERED!");

      const NO_CONTEXTS_FALLBACK = [
        "Sorry, what do you want to do next?",
        "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
        "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
      ];

      let current_fallback_speech = "<speak>" + NO_CONTEXTS_FALLBACK[app.data.fallbackCount] + "</speak>";
      let current_fallback_phrase = NO_CONTEXTS_FALLBACK[app.data.fallbackCount];

      let fallbackCard = app.buildRichResponse();
      fallbackCard.addSimpleResponse({
        speech: current_fallback_speech,
        displayText: current_fallback_phrase
      });

      if (hasScreen === true) {
        // The user has a screen, thus let's show them suggestion chips!
        fallbackCard.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
      }

      handleFallback(app, () => {
        app.ask(fallbackCard);
      });
    }

    /*
    The following are the required action maps!
      Each intent and fallback require action mapping.
      These match with the constants declared at the top of the script.
    */
    let actionMap = new Map(); // Mandatory
    actionMap.set(WELCOME_ACTION, welcome); // Welcome (Aka home) intent
    actionMap.set(WELCOME_FALLBACK, menuFallback); // Welcome menu fallback

    actionMap.set(TRAIN_ACTION, trainBot); // The 'Rank movies' intent
    actionMap.set(TRAIN_FALLBACK, votingFallback); // The 'Rank movies' fallback. Maintains the context parameters.
    actionMap.set(VOTED_ACTION, voted); // When an user votes (either in the movie ranking or selected carousel item areas) they get sent to this intent.
    actionMap.set(FINAL_FALLBACK, finalPromptFallback); // When the user up/down votes a movie recommendation they are shown this fallback.

    actionMap.set(DISLIKE_RECOMMENDATIONS_ACTION, dislikeRecommendations); // Provides the ability to downvote all movie recommendations at the carousel selector without clicking on the individual movies.
    actionMap.set(DISLIKE_RECOMMENDATIONS_FALLBACK, dislikeRecommendationsFallback); // Provides the ability to downvote all movie recommendations at the carousel selector without clicking on the individual movies.
    actionMap.set(RECOMMEND_ACTION, recommendMovie); // Recommend movie intent - showing the movie carousel
    actionMap.set(RECOMMEND_FALLBACK, listFallback); // Fallback for the recommend movie intent (carousel fallback)

    actionMap.set(ITEM_SELECTED, itemSelected); // Response to clicking on a list item
    actionMap.set(ITEM_SELECTED_FALLBACK, votingFallback); // Fallback for item selected (voting fallback)

    actionMap.set(MOVIE_INFO_ACTION, moreMovieDetails); // plot spoilers action:fucntion mapping
    actionMap.set(MOVIE_INFO_FALLBACK, votingFallback); // plot spoilers fallback = votingFallback

    actionMap.set(LEADERBOARD, getLeaderboard); // Show the user their leaderboard position
    actionMap.set(LEADERBOARD_FALLBACK, getLeaderboardFallback); // Handle the leaderboard fallback appropriately!
    actionMap.set(GOAT, getGoat); // Show the most upvoted movies to the user
    actionMap.set(GOAT_FALLBACK, getgoatFallback); // Handle the GOAT fallback appropriately!
    actionMap.set(HELPANYWHERE, getHelpAnywhere); // Get the user help wherever they are!
    actionMap.set(HELPANYWHERE_FALLBACK, getHelpFallback); // Handle the help fallback appropriately!

    actionMap.set(HANDLE_NO_CONTEXTS_FALLBACK, handleNoContextsFallback); // handling a lack of appropriate contexts

    actionMap.set(GOODBYE, goodbye); // Quit application

    app.handleRequest(actionMap); // Mandatory
  } else {
    /*
    The request was not from Dialogflow, this could be an attempted attack!
    */
    console.log("REQUEST NOT FROM DIALOGFLOW ERROR ERROR ERROR!"); // Next level would be to trigger a warning or log the infraction in mongodb.
    response.status(400).send(); // Take this, attacker!
  }


});
