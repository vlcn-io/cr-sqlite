rsync -vhra ./core/ ../libsql/libsql-sqlite3/ext/crr/ --include='**.gitignore' --exclude='**.git' --filter=':- .gitignore' --delete-after
