module Main exposing (main)

import Browser
import Browser.Navigation as Nav
import Html exposing (text)
import Page.BookmarkDetail
import Page.Home
import Page.NewBookmark
import Page.EditBookmark
import Url exposing (Url)
import Url.Parser exposing ((</>), Parser, int, oneOf, s, top)


type Page
    = HomePage Page.Home.Model
    | BookmarkDetailPage Page.BookmarkDetail.Model
    | NewBookmarkPage Page.NewBookmark.Model
    | EditBookmarkPage Page.EditBookmark.Model
    | PlaceholderPage String
    | NotFoundPage

type Route
    = Home
    | BookmarkDetail Int
    | NewBookmark
    | EditBookmark Int
    | NotFound

type alias Model =
    { key : Nav.Key
    , url : Url
    , page : Page
    }

type Msg
    = UrlRequested Browser.UrlRequest
    | UrlChanged Url
    | HomeMsg Page.Home.Msg
    | BookmarkDetailMsg Page.BookmarkDetail.Msg
    | NewBookmarkMsg Page.NewBookmark.Msg
    | EditBookmarkMsg Page.EditBookmark.Msg

main : Program () Model Msg
main =
    Browser.application
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        , onUrlRequest = UrlRequested
        , onUrlChange = UrlChanged
        }

init : () -> Url -> Nav.Key -> ( Model, Cmd Msg )
init _ url key =
    ( { key = key
      , url = url
      , page = routeToPage (urlToRoute url)
      }
    , Cmd.none
    )

update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        UrlRequested urlRequest ->
            case urlRequest of
                Browser.Internal url ->
                    ( model, Nav.pushUrl model.key (Url.toString url) )

                Browser.External href ->
                    ( model, Nav.load href )

        UrlChanged url ->
            ( { model | url = url, page = routeToPage (urlToRoute url) }
            , Cmd.none
            )

        HomeMsg subMsg ->
            case model.page of
                HomePage homeModel ->
                    let
                        ( newModel, cmd ) =
                            Page.Home.update subMsg homeModel
                    in
                    ( { model | page = HomePage newModel}
                    , Cmd.map HomeMsg cmd
                    )

                _ ->
                    ( model, Cmd.none )
        BookmarkDetailMsg subMsg ->
                    case model.page of
                        BookmarkDetailPage bookmarkDetailModel ->
                            let
                                ( newModel, cmd ) =
                                    Page.BookmarkDetail.update subMsg bookmarkDetailModel
                            in
                            ( { model | page = BookmarkDetailPage newModel}
                            , Cmd.map BookmarkDetailMsg cmd
                            )

                        _ ->
                            ( model, Cmd.none )

        NewBookmarkMsg subMsg ->
            case model.page of
                NewBookmarkPage newBookmarkModel ->
                    let
                        ( newNewBookmarkModel, cmd ) =
                            Page.NewBookmark.update subMsg newBookmarkModel
                    in
                    ( { model | page = NewBookmarkPage newNewBookmarkModel }
                    , Cmd.map NewBookmarkMsg cmd
                    )
                _ ->
                    (model, Cmd.none)

        EditBookmarkMsg subMsg ->
            case model.page of
                EditBookmarkPage editBookmarkModel ->
                    let
                        ( newModel, cmd ) =
                            Page.EditBookmark.update subMsg editBookmarkModel
                    in
                    ( { model | page = EditBookmarkPage newModel}
                    , Cmd.map EditBookmarkMsg cmd
                    )

                _ ->
                    ( model, Cmd.none )


view : Model -> Browser.Document Msg
view model =
    case model.page of
        HomePage homeModel ->
            { title = "Bookmarks"
            , body = [ Page.Home.view homeModel |> Html.map HomeMsg ]
            }

        BookmarkDetailPage bookmarkDetailModel ->
            { title = "Bookmark Detail"
            , body = [ Page.BookmarkDetail.view bookmarkDetailModel |> Html.map BookmarkDetailMsg]
            }

        NewBookmarkPage newBookmarkModel ->
            { title = "New Bookmark"
            , body = [ Page.NewBookmark.view newBookmarkModel |> Html.map NewBookmarkMsg]
            }

        EditBookmarkPage editBookmarkModel ->
                    { title = "Edit Bookmark"
                    , body = [ Page.EditBookmark.view editBookmarkModel |> Html.map EditBookmarkMsg]
                    }

        PlaceholderPage info ->
            { title = "Placeholder for " ++ info
            , body = [ text ("Placeholder for " ++ info) ]
            }

        NotFoundPage ->
            { title = "Not Found"
            , body = [ text "Page not found" ]
            }


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.none

urlToRoute : Url -> Route
urlToRoute url =
    Url.Parser.parse routeParser url
        |> Maybe.withDefault NotFound

routeParser : Parser (Route -> a) a
routeParser =
    oneOf
        [ Url.Parser.map Home top
        , Url.Parser.map NewBookmark (s "bookmarks" </> s "new")
        , Url.Parser.map BookmarkDetail (s "bookmarks" </> int)
        , Url.Parser.map EditBookmark (s "bookmarks" </> int </> s "edit")
        ]

routeToPage : Route -> Page
routeToPage route =
    case route of
        Home -> HomePage Page.Home.init
        NewBookmark -> NewBookmarkPage Page.NewBookmark.init
        EditBookmark id -> EditBookmarkPage (Page.EditBookmark.init id)
        BookmarkDetail id -> BookmarkDetailPage (Page.BookmarkDetail.init id)
        _ -> NotFoundPage
