// function sql<R extends SQL<I>, I extends string>(str: I): R {
//   throw new Error();
// }

// type SQL<S extends string> =
//   S extends `SELECT {${infer Fields}} FROM ${infer FC}`
//     ? Merge<{ fields: ParseFields<Fields> }>
//     : never;

// type Merge<T> = _<{ [k in keyof T]: T[k] }>;
// type _<T> = T;

// // prettier-ignore
// type ParseFields<T> =
//   T extends `${infer Key}: (${infer Select}),${infer Rest}` ? [Trim<Key>, ParseVal<Trim<Select>>, ...ParseFields<Trim<Rest>>] :
//   T extends `${infer Key}: (${infer Select})` ? [Trim<Key>, ParseVal<Trim<Select>>] :
//   T extends `${infer Key}: ${infer Val},${infer Rest}` ? [Trim<Key>, Trim<Val>, ...ParseFields<Trim<Rest>>] :
//   T extends `${infer Key}: ${infer Val}` ? [Trim<Key>, Trim<Val>] :
//   T extends '' ? [] : never;

// // prettier-ignore
// type SimpleParse<T> =
//   Tokenize<T> extends [] ?
//   T extends '' ? [] : never;

// // prettier-ignore
// type ParseVal<T> =
//   T extends `${infer V},` ? V :
//   T extends `${infer V}` ? V : never;

// // prettier-ignore
// type Tokenize<T> =
//   Trim<T> extends `${infer Head} ${infer Tail}` ? [Head, Tail] :
//   Trim<T> extends `${infer Head},${infer Tail}` ? [Head, Tail] :
//   Trim<T> extends `${infer Head}(${infer Tail}` ? [Head, Tail] :
//   Trim<T> extends `${infer Head})${infer Tail}` ? [Head, Tail] :
//   Trim<T> extends `${infer Head};${infer Tail}` ? [Head, Tail] :
//   Trim<T> extends `${infer Head})` ? [Head, ')'] :
//   Trim<T> extends `${infer Head};` ? [Head, ';'] :
//   [Trim<T>, '']

// type X = SimpleParse<"key: y">;

// const s = sql(/* sql */ `SELECT {
//   id: deck.id,
//   slides: (SELECT {
//     id: slide.id,
//     order: slide.order,
//     components: (SELECT {
//       id: component.id,
//       text: component.text
//     } FROM component WHERE component.slide_id = slide.id)
//   } FROM slide WHERE slide.deck_id = deck.id)
// } FROM deck WHERE deck.id = 1;`);

// type Trim<T> = T extends ` ${infer Rest}` ? Trim<Rest> : T;

/*
{
  id,
  slide: {}
} FROM deck

SELECT {
  id,
  slides {
    order
    components {
      text
    }
  }
} FROM deck
  LEFT JOIN slide as slides ON slides.deck_id = deck.id
  LEFT JOIN component as components ON component.slide_id = slide.id

SELECT id, slide."order" as slides_order, component.text as slides_components_text
  FROM deck
  LEFT JOIN slide as slides ON slides.deck_id = deck.id
  LEFT JOIN component as components ON component.slide_id = slide.id

as sub-selects so we can limit?

the join will... duplicate id and such too much since
you'll get a row per final row after the join(s).

obv you can omit things when hierarchichalizing.

SELECT {
  id,
  slides {
    order
    components {
      text
    } via LEFT JOIN component ON component.slide_id = slide.id
  } via LEFT JOIN slide ON slides.deck_id = deck.id
} FROM deck

SELECT id, json_group_array(
  json_object('order', "order"),
  json_object('components, json_group_array('text', "text"))
) FROM deck ...


SELECT json_object(
  'id', deck.id, 
  'slides', json_group_array(json_object(
    'id', slide.id,
    'order', slide."order",
    'components', json_group_array(json_object(
      'id', component.id,
      'text', component.text
    ))
  ))
) from deck left join slide on slide.deck_id = deck.id left join component on component.slide_id = slide.id where deck.id = 1;

json_object('id', deck.id, 'sid', slide.id, 'cid', component.id, 'o', slide."order", 'text', component.text)


====== GOOD TOO! (if indexed correctly)

SELECT json_object(
  'id', deck.id, 
  'slides', (SELECT json_group_array(json_object(
    'id', slide.id,
    'order', slide."order",
    'components', (SELECT json_group_array(json_object(
      'id', component.id,
      'text', component.text
    )) FROM component WHERE component.slide_id = slide.id)
  )) FROM slide WHERE slide.deck_id = deck.id)
) from deck WHERE deck.id = 1;

SELECT {
  id: deck.id,
  slides: (SELECT {
    id: slide.id,
    order: slide.order,
    components: (SELECT {
      id: component.id,
      text: component.text
    } FROM component WHERE component.slide_id = slide.id)
  } FROM slide WHERE slide.deck_id = deck.id)
} FROM deck WHERE deck.id = 1;

-or-

SELECT {
  id,
  slides {
    id,
    order,
    components {
      id,
      text
    } via SELECT FROM component WHERE component.slide_id = slide.id
  } via SELECT FROM slide WHERE slide.deck_id = deck.id
} FROM deck WHERE deck.id = 1;

-or-

SELECT {
  id,
  slides: (SELECT {
    id,
    order,
    components: (SELECT {
      id,
      text
    } FROM component WHERE component.slide_id = slide.id)
  } FROM slide WHERE slide.deck_id = deck.id)
} FROM deck WHERE deck.id = 1;

==== GOOD!!!

SELECT {
  id,
  slides {
    id
    order
    components {
      id
      text
    } via LEFT JOIN component ON component.slide_id = slide.id
  } via LEFT JOIN slide ON slides.deck_id = deck.id
} FROM deck WHERE deck.id = 1

>> translates to:

SELECT
  deck.id as 'id',
  slide.id as 'slides.id',
  slide."order" as 'slides.order',
  component.id as 'slides.components.id',
  component.text as 'slides.components.text'
FROM deck
  LEFT JOIN slide ON slide.deck_id = deck.id
  LEFT JOIN component ON component.slide_id = slide.id
WHERE deck.id = 1

which we post-process into json hierarchy.

can we group by aggregate it?

SELECT
  deck.id as 'id',
  json_group_array(json_object(
    'id', slide.id,
    'order', slide."order",
    'components', json_group_array(json_object(
      'id', component.id,
      'text', component.text
    ))
  ))
FROM deck
  LEFT JOIN slide ON slide.deck_id = deck.id
  LEFT JOIN component ON component.slide_id = slide.id
WHERE deck.id = 1 GROUP BY slide.id;

=====

SELECT deck.id, slide.id, slide."order", component.id, component.text
  FROM deck
  LEFT JOIN slide ON slide.deck_id = deck.id
  LEFT JOIN component ON component.slide_id = slide.id
*/
