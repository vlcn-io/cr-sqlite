import unittest
import subprocess 

class Results:
  def __init__(self, stdout, stderr):
    self.stdout = stdout
    self.stderr = stderr

def run_sqlite3(input):
  if type(input) is list:
    args = ["dist/sqlite3", ":memory:"] + input
  else:
    args = ["dist/sqlite3", ":memory:"] + [input]
  
  proc = subprocess.run(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
  out = proc.stdout.decode('utf8') if type(proc.stdout) is bytes else None
  err = proc.stderr.decode('utf8') if type(proc.stderr) is bytes else None
  return Results(out, err)

class TestSqliteLinesCli(unittest.TestCase):
  def test_cli_scalar(self):
    self.assertEqual(run_sqlite3('select 1').stdout,  '1\n')
    self.assertEqual(
      run_sqlite3(['select name from pragma_function_list where name like "path_%" order by 1']).stdout,  
      "path_absolute\npath_at\npath_basename\npath_debug\npath_dirname\npath_extension\npath_intersection\npath_join\npath_name\npath_normalize\npath_part_at\npath_relative\npath_root\npath_version\n"
    )
    self.assertEqual(
      run_sqlite3(['select name from pragma_module_list where name like "path_%" order by 1']).stdout,  
      "path_parts\n"
    )
    self.assertEqual(
      run_sqlite3(['select * from path_parts("/a/b/c");']).stdout,  
      "normal|a\nnormal|b\nnormal|c\n"
    )

if __name__ == '__main__':
    unittest.main()