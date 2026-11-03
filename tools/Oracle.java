import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import uk.ac.wlv.sentistrength.SentiStrength;

// Reads base64-encoded UTF-8 texts (one per line) from a file, writes "pos neg" per line.
public class Oracle {
  public static void main(String[] a) throws Exception {
    SentiStrength ss = new SentiStrength();
    ss.initialise(new String[] {"sentidata", a[0]});
    try (BufferedReader in = new BufferedReader(new FileReader(a[1]));
         PrintWriter out = new PrintWriter(new FileWriter(a[2]))) {
      String line;
      while ((line = in.readLine()) != null) {
        String text = new String(Base64.getDecoder().decode(line), StandardCharsets.UTF_8);
        out.println(ss.computeSentimentScores(text));
      }
    }
  }
}
