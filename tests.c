void cfsqlUtilTestSuite();
void cfsqlTableInfoTestSuite();
void cfsqlTestSuite();

int main(int argc, char *argv[])
{
  cfsqlUtilTestSuite();
  cfsqlTableInfoTestSuite();
  cfsqlTestSuite();
}

// TODO: support `if not exists`