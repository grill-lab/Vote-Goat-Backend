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
      'blah',
      'blah',
      'blah',
      'blah',
      'blah',
      'blah',
      'blah',
      'blah'
    ];

    const trigger_values = [1, 3, 7, 10, 15, 20, 25, 35, 50, 100];

    if (trigger_values.includes(recent_activity)) {
      // The recent activity user stored value is present in the 'trigger_values' array
      // We will return the index in the array for easily selecting from one of 10 responses in the intent.
       const activity_index = trigger_values.indexOf(recent_activity);
       const trigger_leaderboard_readout = [3, 5, 7, 9, 10];

       if trigger_leaderboard_readout.includes(activity_index) {
         // Rather than just providing a progress response, we'll give them an update regarding their leaderboard position!
         // TODO: HUG REST request for leaderboard progress information!

         const qs_input = {
           //  HUG REST GET request parameters
           gg_id: userId, // Anonymous google id
           api_key: 'API_KEY'
         };

         return hug_request('HUG', 'target_function', 'GET', qs_input)
         .then(body => {
           // TODO: Update this with the correct leaderboard position code!
           const leaderboard_position = body.position; // PSEUDOCODE!!
           const text_to_return = `You've taken ${leaderboard_position} place in Vote Goat!`;
           // TODO: Improve the text we return for leaderboard related information!
           return text_to_return;
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

//////////////////////////////////////////////////////////////////////////
// TEMPLATE CODE!
//////////////////////////////////////////////////////////////////////////

const check_progress = check_recent_activity(conv);

if (check_progress != NONE) {
  // AFAIK within an individually triggered intent we're limited to the quantity of elements we can trigger.
  // For this reason, we'll stick to just simple responses until this changes.
  if (check_progress >= 0 || check_progress <= 10) {
    // The function will return an index value thus this should always trigger
    // If we add more progress messages this range will need to be updated!
    conv.ask(
      new SimpleResponse({
        speech: progress_speech[check_progress],
        text: progress_text[check_progress]
      })
    );
  }
}
