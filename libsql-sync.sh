rsync -vhra ./core/ ../libsql/libsql-sqlite3/ext/crr/ \
  --include='**.gitignore' \
  --exclude='**.git' \
  --exclude='shell.c' \
  --exclude='sqlite3.c' \
  --exclude='sqlite' \
  --exclude='sqlite3.h' \
  --exclude='sqlite3ext.h' \
  --filter=':- .gitignore' \
  --delete-after
