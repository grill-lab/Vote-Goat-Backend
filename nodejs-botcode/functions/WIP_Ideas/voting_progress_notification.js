function check_recent_activity (conv) {
  const recent_activity = conv.user.storage.recent_activity;

  if (typeof recent_activity !== 'undefined' && lookup_user_id) {
    /*
      The user has recent_activity in their user storage
      How often should we trigger activity messages?
        * Most users are short term users, however once v2 is out this may change. Big achievements may never trigger!
        * Could be an exponential thing?
    */
    const progress_speech = [
      'Keep ranking movies!',
      'Nice one!',
      'Bravo!!!',
      'Keep it Up !!',
      'You are the best!!!',
      'Shoot..!!!',
      'Do it again.!!!',
      'Great taste !!!',
      'I kind of love that!!',
      'Fair Enough!!!'
      'Fantastic!!!'
      'Awesome!!!'
      'Yay!!'
      'You got this!'
      'Looking good!' 
      'Looking strong!'
      'Keep it going!'
      'Almost there!'
      'You are killing it!'
      'Way to go! Way to run!'
      'You have got it in the bag!'
      'You are a rockstar! '
      'You are so amazing!'
      
    ];

    const trigger_values = [1, 3, 7, 10, 15, 20, 25, 35, 50, 100]; // TODO: Replace with random number selection? Or better to have fixed progression notifications?

    if (trigger_values.includes(recent_activity)) {
      // The recent activity user stored value is present in the 'trigger_values' array
      // We will return the index in the array for easily selecting from one of 10 responses in the intent.
      const activity_index = trigger_values.indexOf(recent_activity);
      const trigger_leaderboard_readout = [3, 10, 20, 35, 50];

      if (trigger_leaderboard_readout.includes(activity_index)) {
      /*
        Rather than just providing a progress response, we'll give them an update regarding their leaderboard position!
        We wouldn't want to remind them of their leaderboard position every notification.
      */

      const qs_input = {
       //  HUG REST GET request parameters
       gg_id: userId, // Anonymous google id
       api_key: 'API_KEY'
      };

      return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
      .then(body => {
        if (body.success === true && body.valid_key === true) {
          const leaderboard_position = body.movie_leaderboard_ranking; // The user's ranking
          const total_user_votes = body.total_movie_votes; // How many movies the user has ranked

          possible_leaderboard_notifications = [
            `You've taken ${leaderboard_position} place in Vote Goat! Keep on voting!`,
            `Wow, you've voted ${total_user_votes} times, you sure know your movies!`,
            `Incredible! You've ranked ${total_user_votes} movies, keep it up!`,
            'You are a Star!, You are leading at position ${leaderboard_position}.Keep winning!!!',
            `That's a job well done!, You ranked ${total_user_votes} movies.You are almost there!!',
            'You are the best!!!,You ranked ${total_user_votes} movies',            
            
          ]; // TODO: Add more notifications!

          notification_integer = Math.floor(Math.random() * 3); // Random number between 0 & 2
          return possible_leaderboard_notifications[notification_integer]; // Return randomly selected notification
        } else {
          // Rather than throwing an error, let's just return a generic response!
          return progress_speech[activity_index];
        }
      })
      .catch(error_message => {
       return catch_error(conv, error_message, 'progress_notification');
      });

      } else {
        // Return a messages
        // Perhaps rather than returning static assigned progress text, randomize the encouragement text selection?
        return progress_speech[activity_index];
      }
    } else {
      // The user hasn't triggered a motivation prompt!
      return NONE
    }

  } else {
    // TODO: Look up the user's progress via HUG?
    // TODO: If above fails, return NONE?
    return NONE
  }
}

////////////////////////////////////////////////////////////////////////////////
// TEMPLATE CODE!
// Use the code below this message wherever we want the notifications to appear!
////////////////////////////////////////////////////////////////////////////////

const check_progress = check_recent_activity(conv);

if (check_progress != NONE) { // TODO: Verify that this 'NONE' check works properly, might need a slight tweak!
  /*
    Show the user a simple response containing a leaderboard|progress notification
    Rather than a simple notification, we could use a card with a small achievement badge image?
  */
  conv.ask(
    new SimpleResponse({
      speech: progress_speech[check_progress],
      text: progress_text[check_progress]
    })
  );
}
