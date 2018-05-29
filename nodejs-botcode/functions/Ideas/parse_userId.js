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
    return retrieved_user_id.toString();
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

  if (input_string.length >= 80) {
    return true;
  } else {
    if (screen_capabilities === false) {
      // This is a speaker!
      // We could check if speakers are the cause of 13 char long userId.
      console.log(`isIdValid: UserID length < 80 (${input_string.length}) & audio-only device!`);
    }
    return false;
  }
}

function register_userId (user_id_string) {
  /*
    Registering an input UserId in MongoDB
    Doesn't return anything, it just does its' thing.
  */
  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: user_id_string, // Anon Google ID from above
    user_name: 'none_supplied', // TODO: REMOVE THIS LINE - Needs a change in both HUG and MongoDB.
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'create_user', 'GET', qs_input)
  .then(body => {
    const user_existed = body.user_existed;
    const created_user = body.created_user;

    if (user_existed == false && created_user == true) {
      /*
        UserId successfully registered on MongoDB
      */
      console.log("Account created!");
    } else if (user_existed == true && created_user == false) {
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
  */
  const retrieved_id_storage = retrieved_id_storage; // TODO: Verify this storage works!
  const user_gg_id = lookup_user_id(conv);

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
        register_userId(user_gg_id);
        const
        retrieved_id_storage[''] = user_gg_id;
        return user_gg_id;
      }

    } else {
      /*
        The UserId storage did not exist.
        Register user & store data locally!
      */
      register_userId(user_gg_id);
      retrieved_id_storage.user_1 = user_gg_id;
      return user_gg_id; // Return the user's id
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
        register_userId(user_gg_id);
        retrieved_id_storage.unknown_1 = user_gg_id;
        return user_gg_id;
      }
    }
  }
}
