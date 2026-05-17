module Data.Bookmark exposing (Bookmark)

import Json.Decode as Decode exposing (Decoder)


type alias Bookmark =
    { id : Int
    , title : String
    , url : String
    , description : String
    , tags : List String
    }

bookmarkDecoder : Decoder Bookmark
bookmarkDecoder =
    Decode.map5 Bookmark
        (Decode.field "id" Decode.int)
        (Decode.field "title" Decode.string)
        (Decode.field "url" Decode.string)
        (Decode.field "description" Decode.string)
        (Decode.field "tags" (Decode.list Decode.string))
