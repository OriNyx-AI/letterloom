# LetterLoom

A two-player crossword tile game that runs in the browser. It's built with plain HTML, CSS and JavaScript, with no frameworks and no build step.

## How to play

1. Click a tile in your rack to select it, then click a square on the board to place it.
2. Click a tile you placed this turn to send it back to your rack.
3. Press **Play word** when you're done. All tiles must be in one row or column, and they must connect to tiles already on the board.
4. The first word must cover the star ★ in the middle.
5. Bonus squares: **2L/3L** multiply one letter, **2W/3W** multiply the whole word. They only count on the turn a tile is placed there.
6. If you use all 7 tiles in one move, you get a 40-point bonus.
7. The game ends when someone uses their last tile and the bag is empty, or after 4 passes/swaps in a row. Leftover tiles count against you.

Words are checked against the free [Dictionary API](https://dictionaryapi.dev/). You can turn that off with the checkbox and decide for yourselves.

## Run it locally

Any static file server works. With Python:

```
python -m http.server 8123
```

Then open http://localhost:8123.

## How the code is organized

| File | What it does |
| --- | --- |
| `index.html` | Page layout: scoreboard, board, rack, buttons |
| `style.css` | Colors (all in `:root` at the top), board grid, tiles |
| `game.js` | All game logic, in six labeled sections: settings, state, setup, rules, actions, drawing |

## Ideas to build next

- Drag and drop tiles instead of click-to-place
- Blank tiles that can stand for any letter
- A computer opponent
- Save the game in `localStorage` so a refresh doesn't lose it
- Show a preview of the score before you press Play
