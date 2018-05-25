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
