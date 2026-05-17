module Page.NewBookmark exposing (Model, Msg, init, update, view)

import Html exposing (Html, a, div, h1, text)
import Html.Attributes exposing (href)


type alias Model =
    {}

type Msg
    = NoOp

init : Model
init =
    {}

update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )


view : Model -> Html Msg
view model =
    div []
        [ a [ href "/" ] [ text "Home"]
        , h1 [] [ text "New Bookmark"]
        ]
