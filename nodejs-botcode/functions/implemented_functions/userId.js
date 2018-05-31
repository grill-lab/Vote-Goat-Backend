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
