function parse_parameter_list (input_dialogflow_parameter) {
  /*
    Parse the input parameter data from dialogflow
    Outputs a space separated string ready for the HUG REST API GET request
    Should work for any 'list' type parameter.
  */
  var space_separated_string; // What we're going to return to the user

  if (typeof input_dialogflow_parameter !== 'undefined' && (input_dialogflow_parameter.length > 0) && Array.isArray(input_dialogflow_parameter)) { // Validating movie genre user input
    // Genres are present in the user's input
    space_separated_string = input_dialogflow_parameter.join(' '); // Merge into a string for GET request
  } else {
    // The input_dialogflow_parameter parameter didn't pass validation
    space_separated_string = ' ';
  }

  return space_separated_string; // Onwards to the HUG GET request!
}

/////////////// TODO: MOVE CONTEXT CODE

conv.contexts.set('forward_genre', 1, { // Setting the 'forward_genre' context for the next loop
  "placeholder": "placeholder",
  "movieGenres": movie_genres_string
});
console.log(`Set "${movie_genres_string}" into 'forward_genre' context!`);
