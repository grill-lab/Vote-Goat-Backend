function check_recent_activity (conv, voting_intention) {
  const recent_activity = conv.user.storage.recent_activity;
  return new Promise((resolve, reject) => {
  // Do async job
    if (typeof(recent_activity) !== 'undefined') {
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
      progress_response += encourage_progress[Math.floor(Math.random() * encourage_progress.length)]


      const trigger_values = [1, 3, 7, 10, 15, 20, 25, 35, 50, 100]; // TODO: Replace with random number selection? Or better to have fixed progression notifications?

      if (trigger_values.includes(recent_activity)) {
        // The recent activity user stored value is present in the 'trigger_values' array
        // We will return the index in the array for easily selecting from one of 10 responses in the intent.
        const activity_index = trigger_values.indexOf(recent_activity);
        const trigger_leaderboard_readout = [3, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500];

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

              const  total_movie_votes = body.total_movie_votes; // How many movies the user has ranked
              const  total_movie_upvotes = body.total_movie_upvotes; //
              const  total_movie_downvotes = body.total_movie_downvotes;
              const  movie_leaderboard_ranking = body.movie_leaderboard_ranking; // The user's ranking
              const  quantity_users = body.quantity_users;

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
        const error_message = 'No prompt required';
        reject(error_message);
      }

    } else {
      // There was no recent activity value found
      const error_message = 'Progress notification: No recent activity detected!';
      reject(error_message);
    }
  });
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
