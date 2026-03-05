module Main exposing (main)

import Browser
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode

-- MODEL

type alias Todo = 
    { id : Int
    , title : String
    , completed : Bool

    }

type Filter 
  = All
  | Active
  | Completed

type alias Model = 
  { todos : List Todo
  , field : String
  , editingId : Maybe Int
  , editField : String
  , filter : Filter
  , nextId : Int
  }

init : Model
init = 
  { todos = []
  , field = ""
  , editingId = Nothing
  , editField = ""
  , filter = All
  , nextId = 1
  }

-- UPDATE

type Msg 
  = UpdateField String
  | AddTodo
  | ToggleTodo Int
  | DeleteTodo Int
  | StartEdit Int String
  | UpdateEditField String
  | FinishEdit Int
  | CancelEdit
  | SetFilter Filter
  | ClearCompleted

update : Msg -> Model -> Model
update msg model = 
  case msg of
      UpdateField value ->
        { model | field = value }
      AddTodo -> 
        if String.trim model.field == "" then
          model
        else 
          { model | todos = model.todos ++ [ { id = model.nextId, title = String.trim model.field, completed = False }]
          , field = ""
          , nextId = model.nextId + 1
          }
      ToggleTodo id -> 
        {model 
          | todos = 
              List.map
                (\todo -> 
                  if todo.id == id then 
                    { todo | completed = not todo.completed } 
                  else 
                    todo
                  ) 
                  model.todos}
      DeleteTodo id -> 
        { model | todos = List.filter(\todo -> todo.id /= id) model.todos }
      StartEdit id title -> 
        { model | editingId = Just id, editField = title }
      UpdateEditField value -> 
        { model | editField = value }
      FinishEdit id -> 
        if String.trim model.editField == "" then
          { model | todos = List.filter (\todo -> todo.id /= id) model.todos
          , editingId = Nothing
          , editField = "" 
          } 
        else 
          { model
            | todos =
                List.map
                  (\todo ->
                    if todo.id == id then
                      { todo | title = String.trim model.editField }
                      else
                        todo
                  )
                  model.todos
            , editingId = Nothing
            , editField = ""
          }
      CancelEdit -> { model | editingId = Nothing, editField = "" }
      SetFilter f -> 
        { model | filter = f }
      ClearCompleted ->
        { model | todos = List.filter (\todo -> not todo.completed)  model.todos }

        

-- VIEW 

view : Model -> Html Msg
view model =
  let
    filteredTodos = 
      case model.filter of 
        All -> model.todos
        Active -> List.filter (\todo -> not todo.completed) model.todos
        Completed -> List.filter (\todo -> todo.completed) model.todos
    
    remaining = 
      List.length (List.filter (\todo -> not todo.completed) model.todos)
  in
  div [ class "app" ]
      [ h1 [] [ text "Elm Todos" ]
      , div [ class "input-bar" ]
          [ input
              [ placeholder "What needs to be done?"
              , value model.field
              , onInput UpdateField
              , onEnter AddTodo
              ]
              []
          , button [ class "btn-add", onClick AddTodo ] [ text "Add" ]
          ]
      , ul [ class "todo-list" ]
           (List.map (viewTodo model.editingId model.editField) filteredTodos)
      , viewFooter remaining model.filter
      ]

viewTodo : Maybe Int -> String -> Todo -> Html Msg
viewTodo editingId editField todo =
    li [ class "todo-item" ]
        (if editingId == Just todo.id then
            [ input
                [ class "edit-input"
                , value editField
                , onInput UpdateEditField
                , onKeyDown (FinishEdit todo.id) CancelEdit
                , onBlur (FinishEdit todo.id)
                ]
                []
            ]
         else
            [ input
                [ type_ "checkbox"
                , checked todo.completed
                , onClick (ToggleTodo todo.id)
                ]
                []
            , span
                [ class ("todo-label" ++ if todo.completed then " completed" else "")
                , onDoubleClick (StartEdit todo.id todo.title)
                ]
                [ text todo.title ]
            , button [ class "btn-delete", onClick (DeleteTodo todo.id) ] [ text "×" ]
            ]
        )

viewFooter : Int -> Filter -> Html Msg
viewFooter remaining currentFilter =
  div [ class "footer" ]
      [ span [] [ text (String.fromInt remaining ++ " items left") ]
      , div [ class "filters" ]
        [ filterButton All currentFilter
        , filterButton Active currentFilter
        , filterButton Completed currentFilter
        ]
      , button [ class "btn-clear", onClick ClearCompleted ] [ text "Clear completed" ]
      ]
filterButton : Filter -> Filter -> Html Msg
filterButton f currentFilter = 
  button
    [ class ("filter-btn" ++ if f == currentFilter then " selected" else "")
    , onClick (SetFilter f)
    ]
    [ text (filterToString f) ]

filterToString : Filter -> String
filterToString f = 
  case f of 
    All -> "All"
    Active -> "Active"
    Completed -> "Completed"
      
onKeyDown : Msg -> Msg -> Attribute Msg
onKeyDown enterMsg escapeMsg =
    on "keydown"
        (Json.Decode.field "key" Json.Decode.string
            |> Json.Decode.andThen
                (\key ->
                    if key == "Enter" then
                        Json.Decode.succeed enterMsg
                    else if key == "Escape" then
                        Json.Decode.succeed escapeMsg
                    else
                        Json.Decode.fail "other key"
                )
        )

onEnter : Msg -> Attribute Msg
onEnter msg = 
  on "keydown"
    (Json.Decode.field "key" Json.Decode.string
      |> Json.Decode.andThen
          (\key -> 
              if key == "Enter" then 
                  Json.Decode.succeed msg 
              else 
                Json.Decode.fail "not enter"
          )
    )

main : Program () Model Msg
main = 
  Browser.sandbox
    { init = init
    , update = update
    , view = view
    }