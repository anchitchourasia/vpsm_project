public class Pass {
    @Entity
public class Pass {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int pass_id;

    private String issue_date;
    private String validity_date;

    private int vehicle_id;

    // constructor
    public Pass() {}

    // getters and setters
}
}
