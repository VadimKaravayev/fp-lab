module Page.Home exposing (Model, Msg, init, update, view)

import Html exposing (Html, a, div, h1, li, text, ul)
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
view _ =
    div []
        [ h1 [] [ text "Bookmarks" ]
        , ul []
            [ li [] [ a [ href "/bookmarks/new" ] [ text "Add Bookmark" ] ]
            , li [] [ a [ href "/bookmarks/1" ] [ text "Bookmark #1"] ]
            , li [] [ a [ href "/bookmarks/1/edit" ] [ text "Edit Bookmark #1" ] ]
            ]
        ]
