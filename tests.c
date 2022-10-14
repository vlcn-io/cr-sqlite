void cfsqlUtilTestSuite();
void cfsqlTableInfoTestSuite();
void cfsqlTestSuite();
void cfsqlTriggersTestSuite();
void cfsqlQueryInfoTestSuite();

int main(int argc, char *argv[])
{
  cfsqlUtilTestSuite();
  cfsqlTableInfoTestSuite();
  cfsqlTestSuite();
  cfsqlTriggersTestSuite();
  cfsqlQueryInfoTestSuite();
}
