void cfsqlUtilTestSuite();
void cfsqlTableInfoTestSuite();
void cfsqlTestSuite();
void cfsqlTriggersTestSuite();

int main(int argc, char *argv[])
{
  cfsqlUtilTestSuite();
  cfsqlTableInfoTestSuite();
  cfsqlTestSuite();
  cfsqlTriggersTestSuite();
}
