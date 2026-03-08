module Main exposing (main)

import Browser
import Html exposing (..)
import Html.Events exposing (onClick)
import Html.Attributes exposing (style, class)
import Http
import Json.Decode as Decode exposing (Decoder)
import Dict

main : Program () Model Msg
main = 
  Browser.element
    { init = init
    , update = update
    , subscriptions = subscriptions
    , view = view
    }

type alias Model = 
  { posts : List Post 
  , currentPage : Int
  , status : Status
  , totalCount: Int
  }

type Status 
 = Loading
 | Success 
 | Failure String

type Msg
  = GotPosts (Result String (List Post, Int ))
  | NextPage 
  | PrevPage
  | GoToPage Int
 
type alias Post =
  { id : Int
  , userId : Int
  , title : String 
  , body : String
  }

init : () -> ( Model, Cmd Msg )
init _ = 
  ( { posts = []
    , currentPage = 1
    , status = Loading
    , totalCount = 0
   }
   , fetchPosts 1
   )

update : Msg -> Model -> ( Model, Cmd Msg )
update msg model = 
  case msg of
      GotPosts result ->
        case result of 
          Ok ( posts, totalCount ) -> 
            ( { model | posts = posts, totalCount = totalCount, status = Success }, Cmd.none )
          Err error -> 
            ( { model | status = Failure error }, Cmd.none)

      NextPage -> 
        let 
          newPage = 
            if (model.currentPage + 1) > (totalPages model.totalCount) then 
              1
            else 
              model.currentPage + 1
        in
        ({model | currentPage = newPage, status = Loading }, fetchPosts newPage)

      PrevPage -> 
        let
          newPage = 
            if model.currentPage == 1 then 
              totalPages model.totalCount
            else 
              model.currentPage - 1
        in
        ({model | currentPage = newPage, status = Loading}, fetchPosts newPage)
      
      GoToPage page -> 
        ({ model | currentPage = page, status = Loading }, fetchPosts page)
        

subscriptions : Model -> Sub Msg
subscriptions _ = 
  Sub.none

view : Model -> Html Msg
view model = 
  case model.status of 
    Loading -> 
      text "Loading posts..."
    Failure error ->
      text ("Error: " ++ error)
    Success -> 
      div [ class "container" ] 
          [ div [] (List.map viewPost model.posts)
          , viewPagination model.currentPage model.totalCount
          ]
      

viewPost : Post -> Html Msg
viewPost post = 
  div [ class "post" ]
      [ h2 [] [ text post.title ]
      , p [] [ text post.body ]
      ]

postDecoder : Decoder Post
postDecoder = 
  Decode.map4 Post 
    (Decode.field "id" Decode.int)
    (Decode.field "userId" Decode.int)
    (Decode.field "title" Decode.string)
    (Decode.field "body" Decode.string)

postsDecoder : Decoder (List Post)
postsDecoder = 
  Decode.list postDecoder

fetchPosts : Int -> Cmd Msg
fetchPosts page = 
  Http.request 
    { method = "GET"
    , headers = []
    , url = "https://jsonplaceholder.typicode.com/posts?_page=" 
        ++ String.fromInt page 
        ++ "&_limit=10"
    , body = Http.emptyBody
    , expect = Http.expectStringResponse GotPosts handleResponse
    , timeout = Nothing
    , tracker = Nothing
    }

handleResponse : Http.Response String -> Result String ( List Post, Int)
handleResponse response = 
  case response of 
    Http.GoodStatus_ metadata body -> 
      case Dict.get "x-total-count" metadata.headers of 
        Just totalCountStr -> 
          case String.toInt totalCountStr of 
            Just totalCount -> 
              case Decode.decodeString postsDecoder body of 
                Ok posts -> 
                  Ok ( posts, totalCount )
              
                Err err -> 
                  Err (Decode.errorToString err)

            Nothing -> 
              Err "Invalid x-total-count header"
              
        Nothing -> 
          Err "Missing x-total-count header"
    
    Http.BadUrl_ url -> 
      Err ("Bad URL:" ++ url)
    
    Http.Timeout_ -> 
      Err "Request timed out"
    
    Http.NetworkError_ -> 
      Err "Network error"
    
    Http.BadStatus_ metadata _ -> 
      Err ("Bad status: " ++ String.fromInt metadata.statusCode)

totalPages : Int -> Int
totalPages totalCount = 
  ceiling (toFloat totalCount / 10)

viewPagination : Int -> Int -> Html Msg
viewPagination currentPage totalCount = 
  let 
    lastPage = totalPages totalCount
    start = max 1 (currentPage - 2)
    end = max 3 (currentPage)
    pages = List.range start end
    windowButtons = 
      List.map
        (\page -> 
            button 
              [ onClick (GoToPage page) 
              , class (if page == currentPage then "active" else "")
              ] 
              [ text (String.fromInt page) ]
        )
        pages

    ellipsis = 
      if lastPage > end + 1 then 
        [ text "..."]
      else 
        []
    lastPageButton = 
      if lastPage > end then 
        [ button [ onClick (GoToPage lastPage )
                 , class (if currentPage == lastPage then "active" else "")
                 ] 
                 [ text (String.fromInt lastPage)]]
      else 
        []
    prevButton = 
      [button [ onClick PrevPage ] [ text "<"]]
    nextButton = 
      [button [ onClick NextPage ] [ text ">"]]

  in
  div [ class "pagination" ] 
      (prevButton ++ windowButtons ++ ellipsis ++ lastPageButton ++ nextButton)
