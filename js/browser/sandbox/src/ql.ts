import * as ohmSynth from "ohm-js";

const ohm: typeof ohmSynth = (ohmSynth as any).default;

const grammar = ohm.grammar(String.raw`
CompSQL {
  Select 
  	= caseInsensitive<"SELECT"> "{" PropertyList "}" caseInsensitive<"FROM"> Rest -- obj
    | caseInsensitive<"SELECT"> AllButFrom caseInsensitive<"FROM"> Rest -- row

  AllButFrom = 
    (~caseInsensitive<"FROM"> any)*
  
  SelectInner
    = "{" PropertyList "}" caseInsensitive<"FROM"> Rest

  Rest
  	= AllButClose -- allButClose
    | AllButOpen "[" Rest "]" Rest -- allButOpen
 
  AllButOpen =
  	(~("["|"(") any)*
  
  AllButClose =
    (~("]"|"["|")"|"(") any)*
    
  PropertyList
  	= PropertyList Property ","? -- list
    | "" -- empty
  
  Property
  	= propertyKey ScopedName -- primitive
    | propertyKey "[" caseInsensitive<"SELECT"> SelectInner "]" -- complex
    | propertyKey "(" Select ")" -- complexSingle
  
  propertyKey
  	= name ":"
  
  ScopedName
  	= (name ".")? name
  
  name
  	= (alnum|"_")+
    | "\"" (alnum|"_")+ "\"" -- quoted
}`);

const semantics = grammar.createSemantics();
semantics.addOperation("toSQL", {
  Select_obj(_select, _lBrack, propertyList, _rBrack, _from, rest) {
    return `SELECT json_object(
      ${propertyList.toSQL()}
    ) FROM ${rest.toSQL()}`;
  },

  Select_row(_select, allButFrom, _from, rest) {
    return `SELECT ${allButFrom.toSQL()} FROM ${rest.toSQL()}`;
  },

  AllButFrom(s) {
    return s.sourceString;
  },

  _iter(...children) {
    return children.map((c) => c.sourceString).join();
  },

  SelectInner(_lBrack, propertyList, _rBrack, _from, rest) {
    return `json_object(
      ${propertyList.toSQL()}
    )) FROM ${rest.toSQL()}`;
  },

  Rest_allButOpen(allButOpen, _lParen, r1, _rParen, r2) {
    return `${allButOpen.toSQL()} (${r1.toSQL()}) ${r2.toSQL()}`;
  },

  Rest_allButClose(allButClose) {
    return allButClose.toSQL();
  },

  AllButOpen(s) {
    return s.sourceString;
  },

  AllButClose(s) {
    return s.sourceString;
  },

  PropertyList_list(propList, prop, _maybeComma) {
    return [...propList.toSQL(), prop.toSQL()];
  },

  PropertyList_empty(_) {
    return [];
  },

  Property_primitive(key, scopedName) {
    return `'${key.toSQL()}', ${scopedName.toSQL()}`;
  },

  Property_complex(key, _lParen, _select, selectInner, _rParen) {
    return `'${key.toSQL()}', (SELECT json_group_array(${selectInner.toSQL()})`;
  },

  Property_complexSingle(key, _lParen, select, _rParen) {
    return `'${key.toSQL()}', (${select.toSQL()})`;
  },

  propertyKey(name, _colon) {
    return name.toSQL();
  },

  ScopedName(n1, _dot, n2) {
    if (n1) {
      return n1.toSQL() + "." + n2.toSQL();
    }

    return n2.toSQL();
  },

  name(name) {
    return name.sourceString;
  },
});

export default function parse(str: string): string {
  const matchResult = grammar.match(str);
  if (matchResult.failed()) {
    throw new Error(matchResult.message);
  }

  const adapter = semantics(matchResult);
  return adapter.toSQL();
}

export function sql(strings, ...values) {
  const interoplated = String.raw({ raw: strings }, ...values);
  return parse(interoplated);
}
