void cfsqlUtilTestSuite();
void cfsqlTableInfoTestSuite();
void cfsqlTestSuite();
void cfsqlTriggersTestSuite();
void cfsqlChagesSinceVtabTestSuite();

int main(int argc, char *argv[])
{
  cfsqlUtilTestSuite();
  cfsqlTableInfoTestSuite();
  cfsqlTestSuite();
  cfsqlTriggersTestSuite();
  cfsqlChagesSinceVtabTestSuite();
}
