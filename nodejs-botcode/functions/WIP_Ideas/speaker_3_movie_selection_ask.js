/*
Best practice (according to Google) for presenting list/carousel items to speaker-only users is to only provide the first 3 movies.
We still hold the data for movies 0-9 in the background, but we only tell the user about the first 3.
This can be changed at any time by adding lines w/ incremented '${rec_body[x].title}' tags.
*/
const textToSpeech = `<speak>` +
  `Would you watch the following movies? <break time="0.25s" /> ` +
  `"${rec_body.movies[0].title}"? <break time="0.35s" /> ` +
  `"${rec_body.movies[1].title}"? <break time="0.35s" /> ` +
  `or "${rec_body.movies[2].title}"? <break time="0.35s" /> ` +
  `</speak>`;

conv.data.speaker_rec_movie_01 = `${rec_body.movies[0].title}####first####1st`;
conv.data.speaker_rec_movie_02 = `${rec_body.movies[1].title}####second####2nd`;
conv.data.speaker_rec_movie_03 = `${rec_body.movies[2].title}#####third####3rd`;

const textToDisplay = `Would you watch the following movies? \n` +
                      `${rec_body.movies[0].title}? \n` +
                      `${rec_body.movies[1].title}? \n` +
                      `${rec_body.movies[2].title}? \n`;

conv.contexts.set('speaker_recommend_response', 1, {"test_key": "test_value"});
conv.contexts.set('recommend_movie_context', 0);

chatbase_analytics(
  conv,
  `Experiment ID:${experiment_body.experiment_id}, HUG:${experiment_body.target_hug_function}, AB:${experiment_body.outcome}, KMOV:3, SPEAKER`, // input_message
  'recommend_movie', // input_intent
  'Win' // win_or_fail
);

store_repeat_response(conv, 'recommendMovie', textToSpeech, textToDisplay); // Storing repeat info

conv.ask(
  new SimpleResponse({
    speech: textToSpeech,
    text: textToDisplay
  })
);
