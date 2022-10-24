void crsqlUtilTestSuite();
void crsqlTableInfoTestSuite();
void crsqlTestSuite();
void crsqlTriggersTestSuite();
void crsqlChagesSinceVtabTestSuite();

int main(int argc, char *argv[])
{
  crsqlUtilTestSuite();
  crsqlTableInfoTestSuite();
  crsqlTestSuite();
  crsqlTriggersTestSuite();
  crsqlChagesSinceVtabTestSuite();
}
