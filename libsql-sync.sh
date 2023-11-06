rsync -vhra ./core/ ../libsql/libsql-sqlite3/ext/crr/ \
  --include='**.gitignore' \
  --exclude='**.git' \
  --exclude='sqlite3.h' \
  --exclude='sqlite3ext.h' \
  --filter=':- .gitignore' \
  --delete-after
