package main

import "fmt"
import "github.com/epsalon/decryptid/board"
import "github.com/epsalon/decryptid/rule"
import "github.com/epsalon/decryptid/search"

var testSpec = board.BoardSpec {
	Tiles: [3][2]board.TileId {
		{{Id: 6, Flipped: true}, {Id: 1, Flipped: true}},
		{{Id: 3}, {Id: 5, Flipped: true}},
		{{Id: 4}, {Id: 2, Flipped: true}},
	},
	Buildings: []board.BuildingSpec {
		{0, 1, board.Stone, board.Blue},
		{10, 8, board.Stone, board.White},
		{1, 4, board.Stone, board.Green},
		{8, 2, board.Shed, board.Blue},
		{7, 4, board.Shed, board.White},
		{10, 6, board.Shed, board.Green},
	},
}

func main () {
	b := board.MakeBoard(testSpec)
	rs := rule.AllRules()
	brs := make([]search.Rule, 0, len(rs))
	fmt.Println(rs)
	for _, r := range rs {
		fmt.Println(r)
		br := r.OnBoard(&b)
		brs = append(brs, search.Rule(br))
		rule.Apply(br, &b, 1)
		fmt.Println(b)
	}
	srs := search.RuleSet(brs)
	fmt.Println(srs)
	results := search.FindRuleSets(srs)
	for _, r := range results {
		b := board.MakeBoard(testSpec)
		fmt.Printf("(%v) %v\n", len(r), r)
		for p, rl := range r {
			rule.Apply(rl.(rule.BoardRule), &b, p+1)
		}
		fmt.Println(b)
	}
	
	//rule.Apply(rule.FromSpec(rule.D1Landscape(board.Water))(&b), &b, 1)
	//rule.Apply(rule.FromSpec(rule.OnLandscapes(board.Forest, board.Mountain))(&b), &b, 2)
	//rule.Apply(rule.FromSpec(rule.D1Landscape(board.Swamp))(&b), &b, 3)
	//rule.Apply(rule.FromSpec(rule.OnLandscapes(board.Forest, board.Swamp))(&b), &b, 4)
	//rule.Apply(rule.FromSpec(rule.D3Color(board.Blue))(&b), &b, 5)
	//fmt.Println(b)
}
