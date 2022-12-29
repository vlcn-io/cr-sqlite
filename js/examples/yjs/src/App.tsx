import {
  $getRoot,
  $getSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  EditorState,
  FOCUS_COMMAND,
} from "lexical";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import * as Y from "yjs";

import React, { useState } from "react";
import { Ctx } from "./ctx";
import CrsqlYjs from "@vlcn.io/yjs-provider";

function onError(error: any) {
  throw error;
}

export default function App({ ctx }: { ctx: Ctx }) {
  const [config, setConfig] = useState(
    () =>
      ({
        namespace: "TextComponentEditor",
        onError,
        editorState: null,
        nodes: [
          HeadingNode,
          ListNode,
          ListItemNode,
          QuoteNode,
          CodeNode,
          CodeHighlightNode,
          TableNode,
          TableCellNode,
          TableRowNode,
          AutoLinkNode,
          LinkNode,
        ],
        theme: {},
      } as const)
  );

  return (
    <LexicalComposer initialConfig={config}>
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={<div>Enter some text...</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <CollaborationPlugin
        id="yjs-plugin"
        providerFactory={(id: string, yjsDocMap: Map<string, Y.Doc>) => {
          console.log("id: ", id);
          const doc = new Y.Doc();
          yjsDocMap.set(id, doc);

          // TODO: we'll need to make this conform to the websocket provider
          // interface -- or modify lexical.
          // Seems best to just pretend we're a websocket provider for now.
          const crsqlYjs = await CrsqlYjs(ctx.db, ctx.rx, id, doc);

          const provider = new WebsocketProvider(
            "ws://localhost:1234",
            id,
            doc
          );

          return provider;
        }}
        // Optional initial editor state in case collaborative Y.Doc won't
        // have any existing data on server. Then it'll user this value to populate editor.
        // It accepts same type of values as LexicalComposer editorState
        // prop (json string, state object, or a function)
        // initialEditorState={initialEditorState}
        shouldBootstrap={true}
      />
    </LexicalComposer>
  );
}
