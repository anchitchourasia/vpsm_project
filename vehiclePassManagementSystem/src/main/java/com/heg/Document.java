@Entity
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int document_id;

    private String document_type;
    private String expiry_date;

    private int vehicle_id;

    public Document() {}

    // getters and setters
}