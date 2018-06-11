# Firebase Cloud function explanation

This page will detail every implemented firebase function & intent.

## Helper functions

These functions are called from within the Google Assistant intents.

### catch_error

Function for handling & logging errors. The user quits the bot as a result.

#### Inputs
```
conv              # Current dialogflow conversation
error_message     # String explaining error
intent            # Intent name string
```

### hug_request

A dedicated HUG REST API GET|POST function, can target any HUG function & provide any input!

#### Inputs
```
target_url        # HUG server | NN server (string)
target_function   # Target HUG function (string)
method            # 'POST' for POSTing to HUG, 'GET' for requesting information from HUG
qs_contents       # Multiple inputs (e.g. "variable = {key: value};" )
```

### chatbase_analytics

Simple chatbase implementation, enabling 1-line chatbase implementation within an inent.

If you're interested in alternative chat bot analytics, do follow a similar function style & raise a pull request to add support for everyone else 👍.

#### Inputs
```
conv              # Current dialogflow conversation
input_message     # Message we want to log in the chatbase UI (error/debug/conv messages)
input_intent      # Current intent which called the function (string)
win_or_fail       # Successful vs unsuccessful intent outcome (TODO: Improve this)
```

### forward_contexts

Contexts can contain important metadata which only lasts 1 intent hop, so if we're handling a fallback or repeating the last intent - we need to keep the context alive.

#### Inputs

```
conv                  # Current dialogflow conversation
intent_name           # Current intent which called the function (string)
inbound_context_name  # Input context name (string)
outbound_context_name # Output context name (string)
```

### lookup_user_id

Function to retrieve user Id cleanly.

#### Inputs
```
conv                  # Current dialogflow conversation

```
### isIdValid

The vast majority of userIds logged had length 86-87 characters

Approx 10% of userIds logged had length of 13 characters.

We're assuming that >= 80 is valid, however since this is a random identifier this check may need to change in the future!

### register_userId

Registering an input UserId in MongoDB.

#### Inputs
```
conv                  # Current dialogflow conversation
user_id_string        # UserId string
```

### parse_userId

Purpose of this function is to temporarily store the user's userIds in the user's local storage.
This can help us track how frequently it changes, and to significantly reduce attempted userId registration attempts.
User storage is wiped upon crash, so this is not a long term solution.
https://developers.google.com/actions/identity/user-info

#### Inputs

```
conv                  # Current dialogflow conversation
```
### parse_parameter_list

Parse the input parameter data from dialogflow
Outputs a parsed array string ready for the HUG REST API GET request
Should work for any 'list' type parameter.

#### Inputs
```
input_dialogflow_parameter # straight from the app.intent declaration (movieGenre, voting, etc..)
separator                  # String which splits the list (',' or ' ').
```

### helpExtract

Code de-duplication! Squish JSON array down to string!

#### Inputs
```
input_array # A JSON array (like movieGenres) to squish into a string
```

### genericFallback

A generic fallback helper function, reducing many fallbacks into a single function.

TODO: Fix this!

#### Inputs
```
conv                  # Current dialogflow conversation
intent_name           # Previous intent which called the function (string)
fallback_messages     # List of fallback messages (e.g. ['try again', 'last try', 'goodbye'])
suggestions           # List of suggestion chip strings (e.g. ['Ranking', 'Recommendation', 'Help'])
```

-----

## Google Assistant Intents

This section will describe what each intent does; dialogflow implementation is out of scope.

### Welcome

The welcome intent is the main menu, they arrive here if they launch the bot via the Google Assistant explorer.

### Training

The trainBot function is the primary training function.
A basic card is shown to the user, and they are asked if they like the contents of the card.
The user is provided suggestion chips to pivot the discussion.

### moreMovieInfo

The purpose of the 'moreMovieDetails' function is to read aloud the movie's plot summary to the user during the training phase.
Uses a GET request, talks to HUG and is quite verbose.
The plot was inserted into the card, as reading it aloud would be too disruptive.

### voted

Provides voting functionality - displays a movie (simple response, basic card & suggestion chips), the user votes after seeing this intent.

### getGoat

Displaying the most upvoted movies to the user, allows for genre input.

### getLeaderboard

Intent for showing the user their current leaderboard statistics.

### recommendMovie

Movie recommendation intent.

Has built in A/B testing via the 'get_ab_value' HUG function.

#### TODO:

* Improve the HUG function to be less aggressive (x% of users, not 50% hardcoded)
* Replace random movies with computed model movie recommendations.


### dislikeRecommendations

Downvoting all movies which we displayed in the 'recommendMovie' intent.

Why? Because sometimes users may say they don't want to watch any of the movies we showed them.

### itemSelected

Helper for carousel - reacting to item selection & displaying a movie.
Related: https://developers.google.com/actions/assistant/helpers#getting_the_results_of_the_helper_1
Get & compare the user's selections to each of the item's keys
The param is set to the index when looping over the results to create the addItems contents.


### input.unknown

Fallback used when the Google Assistant doesn't understand which intent the user wants to go to.

### listFallback

Fallback function for the movie carousel selector intent.

Change the CAROUSEL_FALLBACK contents if you want different responses.

TODO: Rename to carousel fallback.

### handle_no_contexts

The purpose of this intent is to handle situations where a context was required but not present within the user's device. This intent ideally is never called, but was triggered during development of v1 occasionally.

### getHelpAnywhere

Provides the user the ability to get help anywhere they are in the bot.

TODO: Provide intent specific help, rather than verbose manual response.

### goodbye

An intent enabling the user to manually quit the bot.
We can't provide suggestion chips, but button links still work (for outbound survey request on exit).
