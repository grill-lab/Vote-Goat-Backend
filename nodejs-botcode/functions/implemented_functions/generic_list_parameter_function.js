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

/////////////// TODO: MOVE CONTEXT CODE

conv.contexts.set('forward_genre', 1, { // Setting the 'forward_genre' context for the next loop
  "placeholder": "placeholder",
  "movieGenres": movie_genres_string
});
console.log(`Set "${movie_genres_string}" into 'forward_genre' context!`);
